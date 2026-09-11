import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import {
  bookVertoFx,
  getVertoConfig,
  listVertoWallets,
  MOCK_WALLETS,
  mockRate,
  quoteVertoFx,
  sendVertoPayout,
  sendVertoToBusiness,
  vertoConfigured,
  vertoLogin,
} from "../_shared/verto.ts";

type Action =
  | "status"
  | "wallets"
  | "quote"
  | "convert"
  | "send"
  | "history"
  | "save_partner";

function looseFrom(admin: ReturnType<typeof createClient>) {
  return admin as unknown as { from: (t: string) => any; rpc: typeof admin.rpc; auth: typeof admin.auth };
}

async function requireStaff(admin: ReturnType<typeof createClient>, req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: jsonResponse({ error: "Unauthorized" }, 401) };
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return { error: jsonResponse({ error: "Unauthorized" }, 401) };
  const db = looseFrom(admin);
  const [{ data: isAdmin }, { data: isFinance }] = await Promise.all([
    db.rpc("has_role", { _user_id: user.id, _role: "admin" }),
    db.rpc("has_role", { _user_id: user.id, _role: "finance" }),
  ]);
  if (!isAdmin && !isFinance) return { error: jsonResponse({ error: "Forbidden" }, 403) };
  return { user };
}

async function insertTransfer(admin: ReturnType<typeof createClient>, row: Record<string, unknown>) {
  const db = looseFrom(admin);
  const { data, error } = await db.from("verto_transfers").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    const staff = await requireStaff(admin, req);
    if ("error" in staff && staff.error) return staff.error;
    const user = staff.user!;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "status") as Action;
    const live = vertoConfigured();
    const cfg = getVertoConfig();
    const db = looseFrom(admin);

    if (action === "status") {
      let companyId: string | null = cfg.companyIdOverride || null;
      let loginOk = false;
      let loginError: string | null = null;
      if (live) {
        try {
          const session = await vertoLogin();
          companyId = session.companyId || companyId;
          loginOk = true;
        } catch (e) {
          loginError = e instanceof Error ? e.message : String(e);
        }
      }
      return jsonResponse({
        configured: live,
        mode: live ? "live" : "mock",
        env: cfg.env,
        companyId,
        loginOk,
        loginError,
        docs: "https://docs.verto.co/",
        purposeId: cfg.purposeId,
      });
    }

    if (action === "wallets") {
      if (!live) return jsonResponse({ mode: "mock", wallets: MOCK_WALLETS });
      const wallets = await listVertoWallets();
      return jsonResponse({ mode: "live", wallets });
    }

    if (action === "quote") {
      const from = String(body.from_currency || "").toUpperCase();
      const to = String(body.to_currency || "").toUpperCase();
      if (!from || !to) return jsonResponse({ error: "from_currency and to_currency required" }, 400);
      if (!live) {
        const rate = mockRate(from, to);
        return jsonResponse({
          mode: "mock",
          rate,
          vfxToken: `mock-${from}-${to}-${Date.now()}`,
          expiry: new Date(Date.now() + 30_000).toISOString(),
        });
      }
      const quote = await quoteVertoFx(from, to);
      return jsonResponse({ mode: "live", ...quote });
    }

    if (action === "convert") {
      const sourceWalletId = String(body.source_wallet_id || "");
      const targetWalletId = String(body.target_wallet_id || "");
      const sourceAmount = Number(body.source_amount);
      const from = String(body.from_currency || "").toUpperCase();
      const to = String(body.to_currency || "").toUpperCase();
      if (!sourceWalletId || !targetWalletId || !Number.isFinite(sourceAmount) || sourceAmount <= 0) {
        return jsonResponse({ error: "source_wallet_id, target_wallet_id and source_amount required" }, 400);
      }
      if (!live) {
        const rate = mockRate(from || "CAD", to || "USD");
        const row = await insertTransfer(admin, {
          flow_type: "fx",
          status: "completed",
          mode: "mock",
          source_currency: from || "CAD",
          dest_currency: to || "USD",
          source_amount: sourceAmount,
          dest_amount: Number((sourceAmount * rate).toFixed(2)),
          fx_rate: rate,
          source_wallet_id: sourceWalletId,
          dest_wallet_id: targetWalletId,
          payment_id: crypto.randomUUID(),
          client_reference: String(body.reference || "mock-fx"),
          created_by: user.id,
        });
        return jsonResponse({ mode: "mock", success: true, transfer: row });
      }
      const quote = body.vfx_token
        ? { vfxToken: String(body.vfx_token), rate: Number(body.rate) || 0 }
        : await quoteVertoFx(from, to);
      const booked = await bookVertoFx({
        sourceWalletId,
        targetWalletId,
        sourceAmount,
        vfxToken: quote.vfxToken,
        reference: String(body.reference || ""),
      });
      const row = await insertTransfer(admin, {
        flow_type: "fx",
        status: "requested",
        mode: "live",
        source_currency: from,
        dest_currency: to,
        source_amount: sourceAmount,
        dest_amount: quote.rate ? Number((sourceAmount * quote.rate).toFixed(2)) : null,
        fx_rate: quote.rate || null,
        source_wallet_id: sourceWalletId,
        dest_wallet_id: targetWalletId,
        payment_id: booked.paymentId,
        client_reference: String(body.reference || ""),
        raw: booked.raw,
        created_by: user.id,
      });
      return jsonResponse({ mode: "live", success: true, transfer: row, verto: booked.raw });
    }

    if (action === "send") {
      const partnerId = String(body.partner_id || "");
      const sourceWalletId = String(body.source_wallet_id || "");
      const sourceAmount = Number(body.source_amount);
      const currency = String(body.currency || "").toUpperCase();
      const flow = String(body.flow || "vpay");
      if (!partnerId || !sourceWalletId || !Number.isFinite(sourceAmount) || sourceAmount <= 0) {
        return jsonResponse({ error: "partner_id, source_wallet_id and source_amount required" }, 400);
      }
      const { data: partner, error: pErr } = await db
        .from("payment_partners")
        .select("id, name, code, verto_company_id, verto_beneficiary_id, verto_purpose_id, settlement_currency")
        .eq("id", partnerId)
        .maybeSingle();
      if (pErr) return jsonResponse({ error: pErr.message }, 500);
      if (!partner) return jsonResponse({ error: "Partner not found" }, 404);

      const purposeId = String(body.purpose_id || partner.verto_purpose_id || cfg.purposeId);
      const reference = String(body.reference || `Partner ${partner.name} ${currency}`);

      if (flow === "vpay") {
        const targetCompanyId = String(body.target_company_id || partner.verto_company_id || "");
        if (!live) {
          if (!targetCompanyId) {
            return jsonResponse({ error: "Set the partner Verto company ID before sending V-Pay" }, 400);
          }
          const row = await insertTransfer(admin, {
            flow_type: "vpay",
            status: "completed",
            mode: "mock",
            source_currency: currency || "USD",
            dest_currency: currency || "USD",
            source_amount: sourceAmount,
            dest_amount: sourceAmount,
            source_wallet_id: sourceWalletId,
            partner_id: partner.id,
            target_company_id: targetCompanyId,
            purpose_id: purposeId,
            payment_id: crypto.randomUUID(),
            client_reference: reference,
            created_by: user.id,
          });
          return jsonResponse({ mode: "mock", success: true, transfer: row });
        }
        if (!targetCompanyId) return jsonResponse({ error: "Partner has no Verto company ID (V-Pay)" }, 400);
        const sent = await sendVertoToBusiness({
          sourceWalletId,
          sourceAmount,
          targetCompanyId,
          purposeId,
          reference,
        });
        const row = await insertTransfer(admin, {
          flow_type: "vpay",
          status: sent.status || "requested",
          mode: "live",
          source_currency: currency || "USD",
          dest_currency: currency || "USD",
          source_amount: sourceAmount,
          dest_amount: sourceAmount,
          source_wallet_id: sourceWalletId,
          partner_id: partner.id,
          target_company_id: targetCompanyId,
          purpose_id: purposeId,
          payment_id: sent.paymentId,
          client_reference: reference,
          raw: sent.raw,
          created_by: user.id,
        });
        return jsonResponse({ mode: "live", success: true, transfer: row, verto: sent.raw });
      }

      const targetAccountId = String(body.target_account_id || partner.verto_beneficiary_id || "");
      if (!targetAccountId) {
        return jsonResponse({ error: "Partner has no Verto beneficiary ID for bank payout" }, 400);
      }
      if (!live) {
        const row = await insertTransfer(admin, {
          flow_type: "payout",
          status: "completed",
          mode: "mock",
          source_currency: currency || "USD",
          dest_currency: currency || "USD",
          source_amount: sourceAmount,
          dest_amount: sourceAmount,
          source_wallet_id: sourceWalletId,
          partner_id: partner.id,
          target_account_id: targetAccountId,
          purpose_id: purposeId,
          payment_id: crypto.randomUUID(),
          client_reference: reference,
          created_by: user.id,
        });
        return jsonResponse({ mode: "mock", success: true, transfer: row });
      }
      const sent = await sendVertoPayout({
        sourceWalletId,
        sourceAmount,
        targetAccountId,
        purposeId,
        reference,
      });
      const row = await insertTransfer(admin, {
        flow_type: "payout",
        status: sent.status || "requested",
        mode: "live",
        source_currency: currency || "USD",
        dest_currency: currency || "USD",
        source_amount: sourceAmount,
        dest_amount: sourceAmount,
        source_wallet_id: sourceWalletId,
        partner_id: partner.id,
        target_account_id: targetAccountId,
        purpose_id: purposeId,
        payment_id: sent.paymentId,
        client_reference: reference,
        raw: sent.raw,
        created_by: user.id,
      });
      return jsonResponse({ mode: "live", success: true, transfer: row, verto: sent.raw });
    }

    if (action === "history") {
      const { data, error } = await db
        .from("verto_transfers")
        .select("*, payment_partners(name, code)")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) {
        const fallback = await db.from("verto_transfers").select("*").order("created_at", { ascending: false }).limit(80);
        if (fallback.error) return jsonResponse({ error: fallback.error.message }, 500);
        return jsonResponse({ transfers: fallback.data || [] });
      }
      return jsonResponse({ transfers: data || [] });
    }

    if (action === "save_partner") {
      const partnerId = String(body.partner_id || "");
      if (!partnerId) return jsonResponse({ error: "partner_id required" }, 400);
      const patch: Record<string, unknown> = {};
      if (body.verto_company_id !== undefined) patch.verto_company_id = String(body.verto_company_id || "") || null;
      if (body.verto_beneficiary_id !== undefined) {
        patch.verto_beneficiary_id = String(body.verto_beneficiary_id || "") || null;
      }
      if (body.verto_purpose_id !== undefined) patch.verto_purpose_id = String(body.verto_purpose_id || "") || null;
      const { error } = await db.from("payment_partners").update(patch).eq("id", partnerId);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Unknown action ${action}` }, 400);
  } catch (e) {
    console.error("verto-ops", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
