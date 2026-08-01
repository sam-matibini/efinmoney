import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { DodoPayments } from "https://esm.sh/dodopayments@2.4.1";
import { creditWalletViaDodo } from "../_shared/dodo-credit.ts";
import { dodoFetch, fromMinorUnits, getDodoConfig } from "../_shared/dodo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, webhook-id, webhook-signature, webhook-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cfg = getDodoConfig();
  if (!cfg.apiKey) {
    return new Response(JSON.stringify({ error: "DODO_PAYMENTS_API_KEY missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const webhookHeaders = {
    "webhook-id": req.headers.get("webhook-id") || "",
    "webhook-signature": req.headers.get("webhook-signature") || "",
    "webhook-timestamp": req.headers.get("webhook-timestamp") || "",
  };

  if (cfg.webhookKey) {
    try {
      const client = new DodoPayments({
        bearerToken: cfg.apiKey,
        webhookKey: cfg.webhookKey,
      });
      client.webhooks.unwrap(rawBody, { headers: webhookHeaders });
    } catch (err) {
      console.error("dodo-webhook signature failed", err);
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("dodo-webhook: DODO_PAYMENTS_WEBHOOK_KEY not set — skipping signature verify");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventType = String(payload.type || "");
  let data = (payload.data || {}) as Record<string, unknown>;
  let meta = (data.metadata || {}) as Record<string, unknown>;

  // Only credit wallet top-ups on succeeded payments
  const status = String(data.status || "").toLowerCase();
  const isSuccessEvent =
    eventType === "payment.succeeded" ||
    (eventType.startsWith("payment.") && (status === "succeeded" || status === "paid"));

  if (!isSuccessEvent) {
    return new Response(JSON.stringify({ ok: true, ignored: eventType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Some webhook deliveries omit checkout metadata — backfill from Payments API
  const paymentIdHint = String(data.payment_id || data.id || "");
  if (
    paymentIdHint &&
    (meta.type !== "wallet_topup" && !String(meta.reference || "").startsWith("efm_dodo_"))
  ) {
    try {
      const fetched = await dodoFetch(`/payments/${encodeURIComponent(paymentIdHint)}`, { method: "GET" });
      if (fetched.ok) {
        data = { ...fetched.json, ...data };
        meta = (data.metadata || fetched.json.metadata || {}) as Record<string, unknown>;
      }
    } catch (err) {
      console.warn("dodo-webhook metadata backfill failed", err);
    }
  }

  if (meta.type !== "wallet_topup" && !String(meta.reference || "").startsWith("efm_dodo_")) {
    return new Response(JSON.stringify({ ok: true, ignored: "not_wallet_topup" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = String(meta.user_id || "");
  const walletId = String(meta.wallet_id || "");
  const currency = String(meta.currency || data.currency || "USD").toUpperCase();
  const paymentId = String(data.payment_id || data.id || webhookHeaders["webhook-id"] || crypto.randomUUID());
  const reference = String(meta.reference || paymentId);

  let amount = Number(meta.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const total = Number(data.total_amount ?? data.settlement_amount ?? data.amount ?? 0);
    amount = fromMinorUnits(total, currency);
  }
  if (!userId || !(amount > 0)) {
    return new Response(JSON.stringify({ error: "Missing user_id or amount in metadata" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const result = await creditWalletViaDodo(
      admin,
      userId,
      currency,
      amount,
      reference,
      walletId || undefined,
      `Top-up via Dodo (${paymentId})`,
    );
    try {
      await admin.from("dodo_payin_transactions").upsert({
        id: reference,
        user_id: userId,
        wallet_id: result.wallet_id,
        currency,
        amount,
        session_id: String(data.checkout_session_id || "") || null,
        payment_id: paymentId,
        status: "succeeded",
        raw: payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
    } catch { /* optional */ }

    return new Response(JSON.stringify({ success: true, already: result.already, wallet_id: result.wallet_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("dodo-webhook credit failed", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Credit failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
