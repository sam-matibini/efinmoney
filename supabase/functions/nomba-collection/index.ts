import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  isNombaPayConfigured,
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
import { resolveNombaCustomerEmail } from "../_shared/nomba-customer-email.ts";
import { selectProfileRow } from "../_shared/postgrestErrors.ts";

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
    const minCredit = 1;
    if (!Number.isFinite(requestedCredit) || requestedCredit < minCredit) {
      return json({ error: `Amount must be at least ${minCredit}` }, 400);
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
    const extraBlocked = [
      Deno.env.get("NOMBA_MERCHANT_EMAIL") || "",
      ...(Deno.env.get("NOMBA_BLOCKED_CUSTOMER_EMAILS") || "").split(","),
    ];
    const profile = await selectProfileRow<{
      email?: string | null;
      interac_email?: string | null;
    }>(
      admin,
      userId,
      "email, interac_email, address_country, country_code, default_currency",
      "email, address_country, country_code, default_currency",
    );
    const jwtInterac = String(
      (userData.user?.user_metadata as { interac_email?: string } | undefined)?.interac_email || "",
    ).trim();
    const interacEmail = String(profile?.interac_email || jwtInterac || "").trim();
    const profileEmail = String(profile?.email || "").trim();
    // Never send the Interac Autodeposit mailbox as Nomba Checkout customerEmail.
    extraBlocked.push(interacEmail, jwtInterac);
    // Use a real personal mailbox for Checkout. Do not blank CAD and mint
    // @efin.money — Nomba blocks that domain ("The provided email is blocked").
    // Interac Autodeposit stays extra-blocked so Checkout never uses it.
    const customerEmail = resolveNombaCustomerEmail(
      String(email || userEmail || profileEmail || ""),
      userId,
      extraBlocked,
    ).email;

    if (walletCurrency === "CAD" && requestedCredit < 2) {
      return json({ error: "Minimum CAD top-up is C$2.00" }, 400);
    }

    let corridor: NombaCorridor;
    let checkoutCurrency: string;
    let checkoutAmount: number;
    let creditAmount: number;
    let creditCurrency: string;
    let platformFee: number;
    let fxRate: number | null = null;

    if (walletCurrency === "CAD") {
      // Nomba Checkout does not accept currency=CAD ("Invalid Currency").
      // Charge USD internationally, then credit the CAD wallet.
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

    // Official Nomba Checkout for NGN + international (CAD→USD, USD/EUR/GBP).
    // Parent accountId stays in the header only — no settlement account numbers required.
    const useOfficialApi = nombaApiConfigured() && (corridor === "nigeria" || corridor === "international");
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

    // Official Nomba Developer Checkout (NGN + CAD/USD/EUR/GBP).
    if (useOfficialApi) {
      const appBase = (Deno.env.get("APP_URL") || "https://www.efin.money").replace(/\/+$/, "");
      const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
      // Browser return MUST hit our edge function so we credit the wallet, then redirect to the app.
      // (Frontend /wallet/topup alone only polls — it never posts ledger entries.)
      const callbackUrl = `${supabaseUrl}/functions/v1/nomba-payment-callback`;
      console.log("Nomba OFFICIAL checkout:", { amountRounded, checkoutCurrency, internalRef, callbackUrl });

      const created = await createNombaCheckoutOrder({
        amount: amountRounded,
        currency: checkoutCurrency,
        callbackUrl,
        customerEmail,
        userId,
        orderReference: internalRef.slice(0, 50),
        meta: {
          efin_txn_id: String(txn.id),
          wallet_id: String(target_wallet_id),
          user_id: userId,
          app_return: returnUrl || `${appBase}/wallet/topup?walletId=${encodeURIComponent(String(target_wallet_id))}`,
        },
      });

      if (!created.ok) {
        await admin.from("nomba_pay_transactions").update({
          status: "failed",
          failure_reason: created.error,
          raw_response: { error: created.error, rail: "nomba_api" },
        }).eq("id", txn.id);
        const blockedEmail = /email is blocked/i.test(created.error);
        const accountHint = created.error.toLowerCase().includes("account number")
          ? " Nomba needs Online Checkout enabled on your live parent account with a settlement account. Email docs@nomba.com — also verify NOMBA_SUBACCOUNT_ID is unset or is a real outlet ID (not the parent accountId)."
          : "";
        return json({
          error: blockedEmail
            ? "Card checkout could not start. Pay with Interac, Wise, or wallet — or try card again in a moment."
            : `${created.error}${accountHint}`,
          code: blockedEmail ? "nomba_email_blocked" : "nomba_checkout_failed",
          hint: accountHint ? "checkout_account_setup" : undefined,
          ...(blockedEmail ? {} : { detail: created.error }),
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

    await admin.from("nomba_pay_transactions").update({
      status: "failed",
      failure_reason: "Lenhub /api/efin Nomba checkout is retired",
    }).eq("id", txn.id);
    return json({
      error: "Lenhub /api/efin Nomba checkout is retired. Use Fincra or Flutterwave.",
      code: "lenhub_retired",
    }, 410);
  } catch (err) {
    console.error("nomba-collection error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
