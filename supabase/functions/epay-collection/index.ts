/**
 * ePay Cashier Gateway — create hosted pay-in (wallet top-up).
 * POST { walletId, currency, amount, successUrl?, failUrl? }
 *
 * ePay cashier currencies: USD / GBP / JPY / HKD / EUR only.
 * CAD wallets: charge USD (FX) and credit CAD on webhook from stored intent.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildEpayWebhookUrl,
  createEpayGatewayOrder,
  isEpayPayinConfigured,
} from "../_shared/epay.ts";
import { resolveFxRate, roundMoney, type FxRateRow } from "../_shared/nomba-topup-quote.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Wallet currencies we accept; charge currency may differ (CAD → USD). */
const SUPPORTED = new Set(["USD", "CAD", "EUR", "GBP"]);
/** Currencies ePay cashier accepts on sendTransaction. */
const EPAY_CHARGE_CURRENCIES = new Set(["USD", "EUR", "GBP", "HKD", "JPY"]);

function jr(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatAmount(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jr(401, { error: "Unauthorized" });

    if (!isEpayPayinConfigured()) {
      return jr(500, {
        error: "ePay pay-in is not configured (EPAY_ACCOUNT + API key)",
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jr(401, { error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const walletId = body?.walletId ? String(body.walletId) : "";
    const currency = String(body?.currency || "USD").toUpperCase();
    const amount = Number(body?.amount);
    const successUrl = String(body?.successUrl || body?.redirectUrl || "").trim();
    const failUrl = String(body?.failUrl || successUrl).trim();

    if (!SUPPORTED.has(currency)) {
      return jr(400, { error: `ePay top-up supports: ${[...SUPPORTED].join(", ")}` });
    }
    if (!Number.isFinite(amount) || amount < 1) {
      return jr(400, { error: "Minimum top-up is 1.00" });
    }
    if (!successUrl) return jr(400, { error: "successUrl (or redirectUrl) required" });
    if (!walletId) return jr(400, { error: "walletId required" });

    const { data: w } = await supabase.from("wallets")
      .select("id, user_id, currency_code").eq("id", walletId).maybeSingle();
    if (!w || w.user_id !== user.id) return jr(403, { error: "Wallet not accessible" });
    if (String(w.currency_code).toUpperCase() !== currency) {
      return jr(400, { error: `Wallet currency (${w.currency_code}) does not match ${currency}` });
    }

    const { data: rl } = await supabase.rpc("check_rate_limit", {
      p_key: `epay_topup:${user.id}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (rl === false) return jr(429, { error: "Too many requests" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let chargeCurrency = currency;
    let chargeAmount = amount;
    if (!EPAY_CHARGE_CURRENCIES.has(currency)) {
      const { data: rateRows } = await admin.from("fx_rates")
        .select("from_currency, to_currency, effective_rate");
      const rate = resolveFxRate(currency, "USD", (rateRows || []) as FxRateRow[]);
      if (!rate || !(rate > 0)) {
        return jr(503, { error: `${currency}/USD rate unavailable — try again shortly` });
      }
      chargeCurrency = "USD";
      chargeAmount = Math.max(roundMoney(amount * rate), 1);
    }

    const merchantOrderNo = `efm_epay_${user.id.slice(0, 8)}_${Date.now().toString(36)}`.slice(0, 50);
    const creditAmtStr = formatAmount(amount);
    const chargeAmtStr = formatAmount(chargeAmount);
    const notifyUrl = buildEpayWebhookUrl("epay-webhook");

    const order = await createEpayGatewayOrder({
      merchantOrderNo,
      amount: chargeAmtStr,
      currency: chargeCurrency,
      notifyUrl,
      successUrl: successUrl.includes("?")
        ? `${successUrl}&epay=1&ref=${encodeURIComponent(merchantOrderNo)}`
        : `${successUrl}?epay=1&ref=${encodeURIComponent(merchantOrderNo)}`,
      failUrl: failUrl.includes("?")
        ? `${failUrl}&epay=0&ref=${encodeURIComponent(merchantOrderNo)}`
        : `${failUrl}?epay=0&ref=${encodeURIComponent(merchantOrderNo)}`,
      remark: `eFinMoney top-up ${currency}${chargeCurrency !== currency ? ` via ${chargeCurrency}` : ""}`,
      language: "en",
      // Prefer US card rails when charging USD (CAD wallets convert to USD).
      paymentCountry: chargeCurrency === "USD" ? "US" : undefined,
    });

    const code = Number(order.json?.code);
    if (!order.ok || code !== 1 || !order.paymentUrl) {
      console.error("epay-collection failed", order.status, order.raw?.slice?.(0, 800));
      const msg = String(order.json?.message || "ePay checkout failed");
      return jr(order.status >= 400 ? order.status : 502, {
        error: msg,
        code: Number.isFinite(code) ? code : undefined,
        provider: order.json,
      });
    }

    const data = order.json?.data ?? {};
    const epayOrderNo = String(data.epayOrderNo || "").trim() || null;

    await admin.from("epay_payin_transactions").upsert({
      id: merchantOrderNo,
      user_id: user.id,
      wallet_id: walletId,
      currency,
      amount: Number(creditAmtStr),
      epay_order_no: epayOrderNo,
      status: "pending",
      raw: {
        ...order.json,
        efm_charge_currency: chargeCurrency,
        efm_charge_amount: Number(chargeAmtStr),
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    return jr(200, {
      success: true,
      checkout_url: order.paymentUrl,
      epay_url: order.paymentUrl,
      merchant_order_no: merchantOrderNo,
      epay_order_no: epayOrderNo,
      reference: merchantOrderNo,
      charge_currency: chargeCurrency,
      charge_amount: Number(chargeAmtStr),
      credit_currency: currency,
      credit_amount: Number(creditAmtStr),
    });
  } catch (err) {
    console.error("epay-collection", err);
    return jr(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});
