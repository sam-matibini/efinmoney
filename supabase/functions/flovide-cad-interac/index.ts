import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  flovideConfigured,
  flovideCreateInteracCollection,
} from "../_shared/flovide.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const OPEN = ["pending", "awaiting_payment", "processing"];
const COLS =
  "id, amount, currency_code, credit_amount, credit_currency, status, reference, provider_reference, provider_order_id, payer_email, payer_name, purpose, transfer_id, target_wallet_id, created_at, expires_at, credited_at, failure_reason";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!flovideConfigured()) {
      if (req.method === "GET") {
        return json({ configured: false, pending: [], rail: "flovide_interac" });
      }
      return json({ error: "Flovide is not configured", code: "provider_not_configured" }, 503);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);
    const admin = createClient(supabaseUrl, service);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const intentId = url.searchParams.get("intent_id");
      if (intentId) {
        const { data, error } = await admin.from("flovide_transactions").select(COLS)
          .eq("id", intentId).eq("user_id", user.id).maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "Intent not found" }, 404);

        // Poll Flovide transactions while webhook is unavailable.
        if (OPEN.includes(String(data.status))) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/flovide-reconcile`, {
              method: "POST",
              headers: {
                Authorization: authHeader,
                apikey: anon,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ intent_id: intentId }),
            });
          } catch (e) {
            console.warn("flovide-cad-interac: reconcile trigger failed", e);
          }
          const { data: fresh } = await admin.from("flovide_transactions").select(COLS)
            .eq("id", intentId).eq("user_id", user.id).maybeSingle();
          return json({ intent: fresh || data, configured: true, rail: "flovide_interac", reconciled: true });
        }

        return json({ intent: data, configured: true, rail: "flovide_interac" });
      }
      const { data: pending } = await admin.from("flovide_transactions").select(COLS)
        .eq("user_id", user.id).eq("kind", "interac_collection")
        .in("status", OPEN)
        .order("created_at", { ascending: false }).limit(5);
      return json({ pending: pending ?? [], configured: true, rail: "flovide_interac" });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const amount = Number(body.amount);
    const walletId = String(body.wallet_id || "");
    const payerEmail = String(body.sender_email || body.email || user.email || "").trim();
    const payerName = String(body.sender_name || body.name || "").trim();
    const purpose = ["topup", "transfer", "merchant_collection"].includes(String(body.purpose))
      ? String(body.purpose)
      : "topup";
    const transferId = typeof body.transfer_id === "string" ? body.transfer_id : null;

    if (!Number.isFinite(amount) || amount < 2) {
      return json({ error: "Amount must be at least CAD 2.00 (Flovide Interac fee is CAD 1.30)" }, 400);
    }
    if (!walletId) return json({ error: "wallet_id required" }, 400);
    if (!payerEmail.includes("@")) return json({ error: "A valid payer email is required" }, 400);

    const { data: wallet } = await userClient.from("wallets")
      .select("id, user_id, currency_code").eq("id", walletId).maybeSingle();
    if (!wallet || wallet.user_id !== user.id) return json({ error: "Invalid wallet" }, 403);
    if (String(wallet.currency_code).toUpperCase() !== "CAD") {
      return json({ error: "Flovide Interac only supports CAD wallets" }, 400);
    }

    const reference = `EFN-FV-${user.id.slice(0, 8)}-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: txn, error: insErr } = await admin.from("flovide_transactions").insert({
      user_id: user.id,
      kind: "interac_collection",
      status: "pending",
      amount: Math.round(amount * 100) / 100,
      currency_code: "CAD",
      credit_amount: Math.round(amount * 100) / 100,
      credit_currency: "CAD",
      target_wallet_id: walletId,
      purpose,
      transfer_id: transferId,
      payer_email: payerEmail,
      payer_name: payerName || null,
      reference,
      expires_at: expiresAt,
      raw_request: { amount, payerEmail, purpose, transferId },
    }).select(COLS).single();

    if (insErr || !txn) {
      return json({ error: "Could not record Interac intent", detail: insErr?.message }, 500);
    }

    const created = await flovideCreateInteracCollection(
      Math.round(amount * 100) / 100,
      payerEmail,
    );

    if (!created.ok) {
      await admin.from("flovide_transactions").update({
        status: "failed",
        failure_reason: String(created.json?.message || created.raw || "Flovide Interac failed"),
        raw_response: created.json,
      }).eq("id", txn.id);
      return json({
        error: String(created.json?.message || "Flovide Interac request failed"),
        provider: created.json,
      }, 200);
    }

    const data = (created.json?.data && typeof created.json.data === "object")
      ? created.json.data as Record<string, unknown>
      : {};
    const providerRef = String(data.reference || data.transaction_id || data.id || created.json?.reference || "").trim() || null;
    const orderId = String(data.transaction_id || data.order_id || data.id || "").trim() || null;
    const fee = Number(data.fee);
    const net = Number(data.net_amount);
    const creditAmount = Number.isFinite(net) && net > 0 ? net : Math.round(amount * 100) / 100;

    await admin.from("flovide_transactions").update({
      status: "awaiting_payment",
      provider_reference: providerRef,
      provider_order_id: orderId,
      credit_amount: creditAmount,
      raw_response: created.json,
    }).eq("id", txn.id);

    const { data: fresh } = await admin.from("flovide_transactions").select(COLS)
      .eq("id", txn.id).maybeSingle();

    return json({
      success: true,
      rail: "flovide_interac",
      intent: fresh || txn,
      message: "Interac Auto Deposit request sent to the payer email. Approve it in your banking app — your CAD wallet credits when Flovide confirms payment.",
      instructions: [
        `Check ${payerEmail} for an Interac e-Transfer money request for CAD ${amount.toFixed(2)}.`,
        Number.isFinite(fee) && fee > 0
          ? `Flovide fee is CAD ${fee.toFixed(2)} — your wallet will be credited CAD ${creditAmount.toFixed(2)}.`
          : "Approve the request in your Canadian banking app (Auto Deposit).",
        "Your eFinMoney CAD wallet credits automatically once Flovide confirms the payment.",
      ],
    });
  } catch (err) {
    console.error("flovide-cad-interac error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
