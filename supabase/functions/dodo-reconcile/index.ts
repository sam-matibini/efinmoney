import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { creditWalletViaDodo } from "../_shared/dodo-credit.ts";
import { dodoFetch, fromMinorUnits, isDodoConfigured } from "../_shared/dodo.ts";

/**
 * Ops/reconcile: credit a succeeded Dodo payment by payment_id.
 * Auth: Authorization Bearer = SUPABASE_SERVICE_ROLE_KEY
 *    or header x-reconcile-secret = DODO_RECONCILE_SECRET
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-reconcile-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jr(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function authorized(req: Request): boolean {
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const reconcile = (Deno.env.get("DODO_RECONCILE_SECRET") || "").trim();
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (service && bearer && bearer === service) return true;
  const hdr = (req.headers.get("x-reconcile-secret") || "").trim();
  if (reconcile && hdr && hdr === reconcile) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!authorized(req)) return jr(401, { error: "Unauthorized" });
    if (!isDodoConfigured()) return jr(500, { error: "Dodo not configured" });

    const body = await req.json().catch(() => ({}));
    const paymentId = String(body?.payment_id || "").trim();
    if (!paymentId) return jr(400, { error: "payment_id required" });

    const r = await dodoFetch(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
    if (!r.ok) return jr(r.status || 502, { error: "Dodo payment fetch failed", provider: r.json });

    const pay = r.json;
    const status = String(pay.status || "").toLowerCase();
    if (status !== "succeeded" && status !== "paid") {
      return jr(409, { error: `Payment status is ${status}, not succeeded` });
    }

    const meta = (pay.metadata || {}) as Record<string, unknown>;
    if (meta.type !== "wallet_topup" && !String(meta.reference || "").startsWith("efm_dodo_")) {
      return jr(400, { error: "Not an eFinMoney wallet top-up payment" });
    }

    const userId = String(meta.user_id || "");
    const walletId = String(meta.wallet_id || "");
    const currency = String(meta.currency || pay.currency || "USD").toUpperCase();
    let amount = Number(meta.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      amount = fromMinorUnits(Number(pay.total_amount ?? pay.amount ?? 0), currency);
    }
    const reference = String(meta.reference || paymentId);
    if (!userId || !(amount > 0)) {
      return jr(400, { error: "Missing user_id or amount in payment metadata" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const result = await creditWalletViaDodo(
      admin,
      userId,
      currency,
      amount,
      reference,
      walletId || undefined,
      `Top-up via Dodo reconcile (${paymentId})`,
    );

    try {
      await admin.from("dodo_payin_transactions").upsert({
        id: reference,
        user_id: userId,
        wallet_id: result.wallet_id,
        currency,
        amount,
        payment_id: paymentId,
        status: "succeeded",
        raw: pay,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    } catch { /* optional */ }

    return jr(200, {
      success: true,
      already: result.already,
      wallet_id: result.wallet_id,
      amount,
      currency,
      reference,
      payment_id: paymentId,
    });
  } catch (err) {
    console.error("dodo-reconcile", err);
    return jr(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});
