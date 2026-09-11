/**
 * Corporate / corridor payout via Verto wallets.
 * Called by execute-transfer with { transfer_id } and x-internal-secret,
 * or by staff with a Bearer token.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import {
  getVertoConfig,
  listVertoWallets,
  sendVertoPayout,
  sendVertoToBusiness,
  vertoConfigured,
} from "../_shared/verto.ts";

function json(body: unknown, status = 200) {
  return jsonResponse(body, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  const expectedSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const internal = expectedSecret && req.headers.get("x-internal-secret") === expectedSecret;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, expectedSecret, { auth: { persistSession: false } });
  const db = admin as unknown as { from: (t: string) => any; auth: typeof admin.auth };

  try {
    if (!internal) {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: userData } = await admin.auth.getUser(token);
      if (!userData?.user) return json({ success: false, error: "Unauthorized", rail: "verto" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const transferId = String(body.transfer_id || "");
    if (!transferId) return json({ success: false, error: "transfer_id required", rail: "verto" }, 400);

    const { data: transfer, error } = await db.from("transfers").select("*").eq("id", transferId).maybeSingle();
    if (error || !transfer) return json({ success: false, error: "Transfer not found", rail: "verto" }, 404);

    const amount = Number(transfer.target_amount || transfer.source_amount || 0);
    const currency = String(transfer.target_currency || transfer.source_currency || "USD").toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ success: false, error: "Invalid payout amount", rail: "verto" }, 400);
    }

    const live = vertoConfigured();
    const cfg = getVertoConfig();
    const paymentId = crypto.randomUUID();
    const reference = `EFM-${String(transferId).slice(0, 8)}`;

    const { data: partners } = await db
      .from("payment_partners")
      .select("id, code, verto_company_id, verto_beneficiary_id, verto_purpose_id")
      .eq("status", "active");
    const mapped = (partners || []).find(
      (p: { verto_company_id: string | null; verto_beneficiary_id: string | null }) =>
        p.verto_company_id || p.verto_beneficiary_id,
    );

    if (!live) {
      await db.from("verto_transfers").insert({
        flow_type: mapped?.verto_company_id ? "vpay" : "payout",
        status: "pending",
        mode: "mock",
        source_currency: currency,
        dest_currency: currency,
        source_amount: amount,
        dest_amount: amount,
        partner_id: mapped?.id ?? null,
        payment_id: paymentId,
        client_reference: reference,
        transfer_id: transferId,
        error_message: "Verto credentials not configured; queued for ops",
      });
      return json({
        success: true,
        queued: true,
        rail: "verto",
        mode: "mock",
        message: "Verto not configured — transfer held for corporate ops",
      });
    }

    const wallets = await listVertoWallets();
    const wallet =
      wallets.find((w) => w.currency === currency && w.available >= amount) ||
      wallets.find((w) => w.currency === currency);
    if (!wallet) {
      return json({ success: false, error: `No Verto ${currency} wallet with funds`, rail: "verto" }, 409);
    }

    const purposeId = mapped?.verto_purpose_id || cfg.purposeId;
    let sent: { paymentId: string; status: string; raw: Record<string, unknown> };

    if (mapped?.verto_company_id) {
      sent = await sendVertoToBusiness({
        sourceWalletId: wallet.id,
        sourceAmount: amount,
        targetCompanyId: mapped.verto_company_id,
        purposeId,
        paymentId,
        reference,
      });
    } else if (mapped?.verto_beneficiary_id) {
      sent = await sendVertoPayout({
        sourceWalletId: wallet.id,
        sourceAmount: amount,
        targetAccountId: mapped.verto_beneficiary_id,
        purposeId,
        paymentId,
        reference,
      });
    } else {
      return json({
        success: false,
        error: "No partner has a Verto company ID or beneficiary ID mapped",
        rail: "verto",
      }, 409);
    }

    await db.from("verto_transfers").insert({
      flow_type: mapped?.verto_company_id ? "vpay" : "payout",
      status: sent.status || "requested",
      mode: "live",
      source_currency: currency,
      dest_currency: currency,
      source_amount: amount,
      dest_amount: amount,
      source_wallet_id: wallet.id,
      partner_id: mapped?.id ?? null,
      target_company_id: mapped?.verto_company_id ?? null,
      target_account_id: mapped?.verto_beneficiary_id ?? null,
      purpose_id: purposeId,
      payment_id: sent.paymentId,
      client_reference: reference,
      transfer_id: transferId,
      raw: sent.raw,
    });

    await db
      .from("transfers")
      .update({
        provider_reference: sent.paymentId,
        provider_charge_id: `verto:${sent.paymentId}`,
      })
      .eq("id", transferId);

    return json({
      success: true,
      rail: "verto",
      payment_id: sent.paymentId,
      status: sent.status,
    });
  } catch (e) {
    console.error("verto-payout", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e), rail: "verto" }, 500);
  }
});

void corsHeaders;
