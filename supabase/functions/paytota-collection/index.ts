import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildPaytotaWebhookUrl,
  createPaytotaPurchase,
  executePaytotaMomoCollection,
  getPaytotaConfig,
  isPaytotaAfricaCurrency,
  isPaytotaConfigured,
  isPaytotaZeroDecimal,
  normalizeAfricaPhone,
  PAYTOTA_SUPPORTED_CURRENCIES,
  paytotaCountryForCurrency,
} from "../_shared/paytota.ts";
import { quoteSameCurrencyTopup } from "../_shared/nomba-topup-quote.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAYTOTA_CURRENCIES = [...PAYTOTA_SUPPORTED_CURRENCIES];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: authErr } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const userId = userData?.user?.id;
    const userEmail = userData?.user?.email;
    if (authErr || !userId) return json({ error: "Unauthorized" }, 401);

    if (!isPaytotaConfigured()) {
      return json({ error: "Card checkout is not configured", code: "provider_not_configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const {
      amount,
      credit_amount,
      target_wallet_id,
      email,
      return_url,
      phone,
      country,
      city,
      street,
      zip,
      state,
    } = body as Record<string, unknown>;

    const requestedCredit = Number(credit_amount ?? amount);
    if (!Number.isFinite(requestedCredit) || requestedCredit < 1) {
      return json({ error: "Amount must be at least 1" }, 400);
    }
    if (!target_wallet_id || typeof target_wallet_id !== "string") {
      return json({ error: "Target wallet required" }, 400);
    }

    const { data: rl } = await admin.rpc("check_rate_limit", {
      p_key: `paytota_collection:${userId}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (rl === false) return json({ error: "Too many top-up attempts. Try again in a minute." }, 429);

    const { data: wallet } = await userClient
      .from("wallets")
      .select("id, user_id, currency_code")
      .eq("id", target_wallet_id)
      .maybeSingle();
    if (!wallet || wallet.user_id !== userId) return json({ error: "Invalid wallet" }, 403);

    const walletCurrency = String(wallet.currency_code).toUpperCase();
    if (!(PAYTOTA_CURRENCIES as string[]).includes(walletCurrency)) {
      return json({ error: `Paytota top-up does not support ${walletCurrency}` }, 400);
    }

    const africa = isPaytotaAfricaCurrency(walletCurrency);
    const customerEmail = String(email || userEmail || "").trim();
    if (!customerEmail || !customerEmail.includes("@")) {
      return json({ error: "A valid email is required for checkout" }, 400);
    }

    let phoneNormalized: string | undefined;
    if (africa) {
      const rawPhone = typeof phone === "string" ? phone.trim() : "";
      if (!rawPhone) {
        return json({
          error: "A mobile money phone number is required for this currency",
          code: "phone_required",
        }, 400);
      }
      phoneNormalized = normalizeAfricaPhone(rawPhone, walletCurrency).e164;
    }

    let checkoutCurrency: string;
    let checkoutAmount: number;
    let creditAmount: number;
    let creditCurrency: string;
    let platformFee: number;
    let fxRate: number | null = null;

    // Same-currency checkout for Western invoice + East Africa MoMo.
    creditCurrency = walletCurrency;
    creditAmount = isPaytotaZeroDecimal(walletCurrency)
      ? Math.max(1, Math.round(requestedCredit))
      : requestedCredit;
    const same = quoteSameCurrencyTopup(creditAmount, walletCurrency);
    platformFee = same.feeAmount;
    checkoutAmount = same.checkoutAmount;
    checkoutCurrency = walletCurrency;

    const amountRounded = isPaytotaZeroDecimal(checkoutCurrency)
      ? Math.max(1, Math.round(checkoutAmount))
      : Math.round(checkoutAmount * 100) / 100;
    if (amountRounded < 1) {
      return json({
        error: `Checkout minimum is 1 ${checkoutCurrency}. Increase the amount and try again.`,
        code: "amount_too_small",
      }, 400);
    }

    const internalRef = `efin-paytota-${userId.slice(0, 8)}-${Date.now()}`;
    const returnUrl = typeof return_url === "string" && return_url.startsWith("http")
      ? return_url.trim()
      : null;
    const appBase = (Deno.env.get("APP_URL") || "https://www.efin.money").replace(/\/+$/, "");
    const successRedirect = returnUrl
      ? (() => {
          const u = new URL(returnUrl);
          u.searchParams.set("paytota", "success");
          u.searchParams.set("walletId", target_wallet_id);
          return u.toString();
        })()
      : `${appBase}/wallet/topup?paytota=success&walletId=${target_wallet_id}`;
    const failureRedirect = returnUrl
      ? (() => {
          const u = new URL(returnUrl);
          u.searchParams.set("paytota", "failed");
          u.searchParams.set("walletId", target_wallet_id);
          return u.toString();
        })()
      : `${appBase}/wallet/topup?paytota=failed&walletId=${target_wallet_id}`;

    const webhookUrl = buildPaytotaWebhookUrl();
    const cfg = getPaytotaConfig();

    const { data: txn, error: insErr } = await admin
      .from("paytota_payin_transactions")
      .insert({
        user_id: userId,
        reference: internalRef,
        amount: amountRounded,
        currency: checkoutCurrency,
        credit_amount: creditAmount,
        credit_currency: creditCurrency,
        checkout_amount: amountRounded,
        checkout_currency: checkoutCurrency,
        email: customerEmail,
        target_wallet_id,
        status: "pending",
        raw_request: {
          credit_amount: creditAmount,
          credit_currency: creditCurrency,
          checkout_amount: amountRounded,
          checkout_currency: checkoutCurrency,
          platform_fee: platformFee,
          fx_rate: fxRate,
          email: customerEmail,
          phone: phoneNormalized ?? null,
          return_url: returnUrl,
          brand_id: cfg.brandId,
          africa_momo: africa,
        },
      })
      .select("id")
      .single();

    if (insErr) {
      console.error("paytota insert failed:", insErr);
      return json({
        error: insErr.message || "Could not record collection",
        detail: insErr.message,
        code: insErr.code,
      }, 500);
    }

    const result = await createPaytotaPurchase({
      email: customerEmail,
      currency: checkoutCurrency,
      amountMajor: amountRounded,
      productName: africa
        ? `eFinMoney ${creditCurrency} mobile money top-up`
        : `eFinMoney ${creditCurrency} wallet top-up`,
      reference: internalRef,
      country: typeof country === "string" ? country : paytotaCountryForCurrency(checkoutCurrency),
      city: typeof city === "string" ? city : undefined,
      street: typeof street === "string" ? street : undefined,
      zip: typeof zip === "string" ? zip : undefined,
      state: typeof state === "string" ? state : undefined,
      phone: phoneNormalized ?? (typeof phone === "string" ? phone : undefined),
      successRedirect,
      failureRedirect,
      successCallback: webhookUrl,
    });

    if (!result.ok) {
      await admin.from("paytota_payin_transactions").update({
        status: "failed",
        failure_reason: result.message,
        raw_response: result.json,
      }).eq("id", txn.id);
      return json({
        error: result.message,
        provider_response: result.json,
      }, 200);
    }

    await admin.from("paytota_payin_transactions").update({
      status: "processing",
      purchase_id: result.purchaseId,
      checkout_url: result.checkoutUrl,
      provider_reference: result.purchaseId,
      raw_response: result.json,
    }).eq("id", txn.id);

    // For Africa MoMo: execute STK push server-side so user gets a PIN prompt
    // instead of being redirected to the hosted invoice page.
    if (africa && result.purchaseId) {
      const exec = await executePaytotaMomoCollection(result.purchaseId);

      await admin.from("paytota_payin_transactions").update({
        last_event: exec.json,
      }).eq("id", txn.id);

      if (!exec.ok) {
        // Fall back to checkout_url redirect if STK push fails
        console.warn("MoMo STK push failed, falling back to checkout_url:", exec.message);
      } else {
        // STK may or may not reach the handset — always return checkout_url as fallback.
        return json({
          success: true,
          transaction_id: txn.id,
          purchase_id: result.purchaseId,
          payment_link: result.checkoutUrl,
          stk_push: true,
          message: "Approve the payment on your phone, or open the checkout page if no prompt arrives.",
          quote: {
            credit_amount: creditAmount,
            credit_currency: creditCurrency,
            checkout_amount: amountRounded,
            checkout_currency: checkoutCurrency,
            platform_fee: platformFee,
            fx_rate: fxRate,
          },
          provider_response: exec.json,
        });
      }
    }

    return json({
      success: true,
      transaction_id: txn.id,
      purchase_id: result.purchaseId,
      payment_link: result.checkoutUrl,
      message: "Redirecting to secure checkout…",
      quote: {
        credit_amount: creditAmount,
        credit_currency: creditCurrency,
        checkout_amount: amountRounded,
        checkout_currency: checkoutCurrency,
        platform_fee: platformFee,
        fx_rate: fxRate,
      },
      provider_response: result.json,
    });
  } catch (err) {
    console.error("paytota-collection error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
