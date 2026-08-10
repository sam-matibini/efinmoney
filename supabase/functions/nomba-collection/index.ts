import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildNombaCallbackUrl,
  collectionUrlForCorridor,
  getNombaPayConfig,
  isNombaPayConfigured,
  nombaCollectionFetch,
  type NombaCorridor,
} from "../_shared/nomba-pay.ts";
import {
  createNombaCheckoutOrder,
  nombaApiConfigured,
} from "../_shared/nomba-api.ts";
import {
  quoteCadWalletViaNombaUsd,
  quoteSameCurrencyTopup,
  resolveFxRate,
  type FxRateRow,
} from "../_shared/nomba-topup-quote.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function resolveCorridor(currency: string): NombaCorridor | null {
  const c = currency.toUpperCase();
  if (c === "NGN") return "nigeria";
  if (["USD", "EUR", "GBP"].includes(c)) return "international";
  return null;
}

async function fetchFxRates(admin: ReturnType<typeof createClient>): Promise<FxRateRow[]> {
  const { data } = await admin
    .from("fx_rates")
    .select("from_currency, to_currency, effective_rate")
    .or(`valid_until.is.null,valid_until.gt.${new Date().toISOString()}`)
    .order("valid_from", { ascending: false })
    .limit(500);
  return (data ?? []) as FxRateRow[];
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

    const body = await req.json().catch(() => ({}));
    const {
      amount,
      credit_amount,
      target_wallet_id,
      email,
      corridor: corridorHint,
      return_url,
    } = body as Record<string, unknown>;

    const requestedCredit = Number(credit_amount ?? amount);
    if (!Number.isFinite(requestedCredit) || requestedCredit < 1) {
      return json({ error: "Amount must be at least 1" }, 400);
    }
    if (!target_wallet_id || typeof target_wallet_id !== "string") {
      return json({ error: "Target wallet required" }, 400);
    }

    const { data: rl } = await admin.rpc("check_rate_limit", {
      p_key: `nomba_pay_collection:${userId}`,
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
    const customerEmail = String(email || userEmail || "").trim();
    if (!customerEmail || !customerEmail.includes("@")) {
      return json({ error: "A valid email is required for checkout" }, 400);
    }

    let corridor: NombaCorridor;
    let checkoutCurrency: string;
    let checkoutAmount: number;
    let creditAmount: number;
    let creditCurrency: string;
    let platformFee: number;
    let fxRate: number | null = null;

    if (walletCurrency === "CAD") {
      const rates = await fetchFxRates(admin);
      const cadToUsd = resolveFxRate("CAD", "USD", rates);
      if (!cadToUsd || cadToUsd <= 0) {
        return json({ error: "CAD/USD exchange rate unavailable. Try again shortly." }, 503);
      }
      const quote = quoteCadWalletViaNombaUsd(requestedCredit, cadToUsd);
      corridor = "international";
      checkoutCurrency = quote.checkoutCurrency;
      checkoutAmount = quote.checkoutAmount;
      creditAmount = quote.creditAmount;
      creditCurrency = quote.creditCurrency;
      platformFee = quote.feeAmount;
      fxRate = quote.fxRateCadToUsd;
    } else {
      creditCurrency = walletCurrency;
      creditAmount = requestedCredit;
      const same = quoteSameCurrencyTopup(requestedCredit, walletCurrency);
      platformFee = same.feeAmount;
      checkoutAmount = same.checkoutAmount;
      checkoutCurrency = walletCurrency;

      corridor = (typeof corridorHint === "string" && corridorHint === "international")
        ? "international" as NombaCorridor
        : resolveCorridor(walletCurrency) ?? "international";

      if (corridor === "nigeria" && walletCurrency !== "NGN") {
        return json({ error: "Nigeria checkout requires an NGN wallet" }, 400);
      }
      if (corridor === "international" && !["USD", "EUR", "GBP"].includes(walletCurrency)) {
        return json({ error: `Card checkout does not support ${walletCurrency} directly` }, 400);
      }
    }

    const useOfficialApi = nombaApiConfigured() && corridor === "nigeria";
    if (!useOfficialApi && !isNombaPayConfigured()) {
      return json({ error: "Card checkout is not configured", code: "provider_not_configured" }, 500);
    }

    const amountRounded = Math.round(checkoutAmount * 100) / 100;
    if (corridor === "international" && amountRounded < 1) {
      return json({
        error: `Card checkout minimum is $1.00 (you’re at $${amountRounded.toFixed(2)}). Increase the send amount and try again.`,
        code: "amount_too_small",
      }, 400);
    }
    if (corridor === "nigeria" && amountRounded < 100) {
      return json({
        error: "Naira card checkout minimum is ₦100. Increase the amount and try again.",
        code: "amount_too_small",
      }, 400);
    }

    const internalRef = `efin-nomba-${corridor}-${userId.slice(0, 8)}-${Date.now()}`;
    const returnUrl = typeof return_url === "string" && return_url.startsWith("http")
      ? return_url.trim()
      : null;

    const { data: txn, error: insErr } = await admin
      .from("nomba_pay_transactions")
      .insert({
        user_id: userId,
        corridor,
        reference: internalRef,
        amount: amountRounded,
        currency: checkoutCurrency,
        credit_amount: creditAmount,
        credit_currency: creditCurrency,
        checkout_amount: amountRounded,
        checkout_currency: checkoutCurrency,
        platform_fee: platformFee,
        fx_rate: fxRate,
        email: customerEmail,
        target_wallet_id,
        status: "pending",
        raw_request: {
          corridor,
          rail: useOfficialApi ? "nomba_api" : "lenhub",
          credit_amount: creditAmount,
          credit_currency: creditCurrency,
          checkout_amount: amountRounded,
          checkout_currency: checkoutCurrency,
          platform_fee: platformFee,
          fx_rate: fxRate,
          email: customerEmail,
          return_url: returnUrl,
        },
      })
      .select("id")
      .single();

    if (insErr) return json({ error: "Could not record collection", detail: insErr.message }, 500);

    // Prefer official Nomba Developer Checkout for NGN (company account).
    if (useOfficialApi) {
      const appBase = (Deno.env.get("APP_URL") || "https://www.efin.money").replace(/\/+$/, "");
      const callbackUrl = returnUrl
        || `${appBase}/wallet/topup?nomba=1&walletId=${encodeURIComponent(String(target_wallet_id))}`;
      console.log("Nomba OFFICIAL checkout:", { amountRounded, checkoutCurrency, internalRef });

      const created = await createNombaCheckoutOrder({
        amount: amountRounded,
        currency: checkoutCurrency,
        callbackUrl,
        customerEmail,
        orderReference: internalRef.slice(0, 50),
        meta: {
          efin_txn_id: String(txn.id),
          wallet_id: String(target_wallet_id),
          user_id: userId,
        },
      });

      if (!created.ok) {
        await admin.from("nomba_pay_transactions").update({
          status: "failed",
          failure_reason: created.error,
          raw_response: { error: created.error, rail: "nomba_api" },
        }).eq("id", txn.id);
        const accountHint = created.error.toLowerCase().includes("account number")
          ? " Nomba business wallet/account number still needs setup in the Nomba dashboard."
          : "";
        return json({
          error: `${created.error}${accountHint}`,
          code: "nomba_checkout_failed",
        }, 200);
      }

      await admin.from("nomba_pay_transactions").update({
        status: "processing",
        order_id: created.orderReference,
        checkout_url: created.checkoutLink,
        provider_reference: created.orderReference,
        raw_response: { rail: "nomba_api", ...created },
      }).eq("id", txn.id);

      return json({
        success: true,
        transaction_id: txn.id,
        order_id: created.orderReference,
        payment_link: created.checkoutLink,
        message: "Redirecting to Nomba checkout…",
        rail: "nomba_api",
        quote: {
          credit_amount: creditAmount,
          credit_currency: creditCurrency,
          checkout_amount: amountRounded,
          checkout_currency: checkoutCurrency,
          platform_fee: platformFee,
          fx_rate: fxRate,
        },
      });
    }

    const cfg = getNombaPayConfig();
    const payload = {
      currency: checkoutCurrency,
      amount: String(amountRounded),
      user: cfg.merchantUser,
      callback: buildNombaCallbackUrl(),
      email: customerEmail,
    };

    const url = collectionUrlForCorridor(corridor);
    console.log("Nomba COLLECTION (lenhub):", { corridor, url, payload, walletCurrency, creditAmount, creditCurrency });

    const result = await nombaCollectionFetch(url, payload);

    if (!result.ok) {
      await admin.from("nomba_pay_transactions").update({
        status: "failed",
        failure_reason: result.message,
        raw_response: result.json,
      }).eq("id", txn.id);
      return json({
        error: result.message,
        provider_response: result.json,
      }, 200);
    }

    await admin.from("nomba_pay_transactions").update({
      status: "processing",
      order_id: result.orderId,
      checkout_url: result.checkoutUrl,
      provider_reference: result.orderId,
      raw_response: result.json,
    }).eq("id", txn.id);

    return json({
      success: true,
      transaction_id: txn.id,
      order_id: result.orderId,
      payment_link: result.checkoutUrl,
      message: walletCurrency === "CAD"
        ? `Pay $${amountRounded.toFixed(2)} USD at checkout — your CAD wallet will be credited C$${creditAmount.toFixed(2)}`
        : "Redirecting to secure checkout…",
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
    console.error("nomba-collection error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
