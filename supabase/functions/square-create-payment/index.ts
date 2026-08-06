/**
 * Charge a Square Web Payments token and credit the user's wallet.
 * Body: { sourceId, amount, currency, walletId, idempotencyKey?, verificationToken? }
 *
 * Docs: https://developer.squareup.com/docs/web-payments/overview
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getSquareConfig, squareConfigured, squareFetch, toSquareAmountMoney } from "../_shared/square.ts";
import { creditWalletViaSquare } from "../_shared/square-credit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPPORTED = new Set(["USD", "CAD", "EUR", "GBP"]);

function jr(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jr(401, { error: "Unauthorized" });

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return jr(401, { error: "Unauthorized" });

    const cfg = getSquareConfig();
    if (!squareConfigured(cfg)) return jr(503, { error: "Square is not configured" });

    const body = await req.json().catch(() => ({}));
    const sourceId = String(body.sourceId || body.source_id || "").trim();
    const walletId = String(body.walletId || body.wallet_id || "").trim();
    const currency = String(body.currency || "USD").toUpperCase();
    const amount = Number(body.amount);
    const idempotencyKey = String(body.idempotencyKey || body.idempotency_key || crypto.randomUUID()).trim();
    const verificationToken = body.verificationToken || body.verification_token
      ? String(body.verificationToken || body.verification_token)
      : undefined;

    if (!sourceId) return jr(400, { error: "sourceId (payment token) required" });
    if (!walletId) return jr(400, { error: "walletId required" });
    if (!SUPPORTED.has(currency)) return jr(400, { error: `Square top-up supports ${[...SUPPORTED].join(", ")} only` });
    if (!Number.isFinite(amount) || !(amount > 0)) return jr(400, { error: "Invalid amount" });
    if (amount > 50_000) return jr(400, { error: "Amount exceeds safety limit" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: wallet } = await admin.from("wallets").select("id, user_id, currency_code")
      .eq("id", walletId).maybeSingle();
    if (!wallet || wallet.user_id !== user.id) return jr(403, { error: "Wallet not found" });
    if (String(wallet.currency_code).toUpperCase() !== currency) {
      return jr(400, { error: `Wallet currency is ${wallet.currency_code}, not ${currency}` });
    }

    const money = toSquareAmountMoney(amount, currency);
    const referenceId = `topup-square-${idempotencyKey.slice(0, 8)}`;

    const paymentBody: Record<string, unknown> = {
      source_id: sourceId,
      idempotency_key: idempotencyKey,
      amount_money: {
        amount: Number(money.amount),
        currency: money.currency,
      },
      location_id: cfg.locationId,
      autocomplete: true,
      reference_id: referenceId.slice(0, 40),
      note: `eFinMoney wallet top-up ${currency} ${amount}`.slice(0, 500),
    };
    if (verificationToken) paymentBody.verification_token = verificationToken;

    const { ok, status, json } = await squareFetch("/v2/payments", {
      method: "POST",
      body: JSON.stringify(paymentBody),
    });

    if (!ok) {
      const detail = String(
        json?.errors?.[0]?.detail || json?.errors?.[0]?.code || json?.message || `Square HTTP ${status}`,
      );
      console.error("square-create-payment failed", status, json);
      return jr(400, { error: detail, square: json?.errors ?? null });
    }

    const payment = (json?.payment ?? {}) as Record<string, unknown>;
    const paymentStatus = String(payment.status || "").toUpperCase();
    const paymentId = String(payment.id || "");
    if (!paymentId) return jr(502, { error: "Square returned no payment id" });

    if (!["COMPLETED", "APPROVED"].includes(paymentStatus)) {
      return jr(400, {
        error: `Payment status ${paymentStatus || "unknown"} — not credited`,
        payment_id: paymentId,
        status: paymentStatus,
      });
    }

    const paidMinor = Number((payment.amount_money as { amount?: number } | undefined)?.amount ?? money.amount);
    const zeroDecimal = new Set(["JPY", "KRW", "VND"]);
    const creditAmount = zeroDecimal.has(currency) ? paidMinor : paidMinor / 100;

    const { already } = await creditWalletViaSquare(
      admin,
      user.id,
      currency,
      creditAmount,
      paymentId,
      walletId,
      `Wallet top-up via Square (${paymentId})`,
    );

    return jr(200, {
      success: true,
      credited: !already,
      already,
      payment_id: paymentId,
      status: paymentStatus,
      amount: creditAmount,
      currency,
      reference: referenceId,
    });
  } catch (err) {
    console.error("square-create-payment", err);
    return jr(500, { error: err instanceof Error ? err.message : "Payment failed" });
  }
});
