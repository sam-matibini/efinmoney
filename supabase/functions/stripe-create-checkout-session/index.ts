// Creates a Stripe Checkout session for international wallet top-up.
// Returns a hosted Stripe Checkout URL. Stripe auto-presents local payment
// methods based on the customer's country (cards, Apple Pay, Google Pay,
// Link, iDEAL, Bancontact, SEPA, BACS, etc.).
//
// Input: { wallet_id, amount, currency, success_url?, cancel_url? }
// Output: { url, session_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.3.1?target=denonext";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-11-20.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const SUPPORTED_CURRENCIES = ["USD", "CAD", "EUR", "GBP"];

// Platform top-up fee: 1.9% + $0.30 equivalent (in minor units of currency).
// You can later move this to PricingConfig.
const FEE_PCT = 0.019;
const FEE_FIXED_MINOR: Record<string, number> = {
  USD: 30, CAD: 30, EUR: 30, GBP: 30,
};

function json(body: unknown, status = 200) {
  return jsonResponse(body, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  const { isStripeEnabled, stripeDisabledResponse } = await import("../_shared/stripe-guard.ts");
  if (!isStripeEnabled()) return stripeDisabledResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const walletId: string = body.wallet_id;
    const amount: number = Number(body.amount);
    const currency: string = String(body.currency || "").toUpperCase();
    const successUrl: string = body.success_url || `${req.headers.get("origin") || "https://efin.money"}/wallet/topup?stripe=success`;
    const cancelUrl: string = body.cancel_url || `${req.headers.get("origin") || "https://efin.money"}/wallet/topup?stripe=cancelled`;

    if (!walletId || !Number.isFinite(amount) || amount <= 0 || !currency) {
      return json({ error: "Invalid input" }, 400);
    }
    if (!SUPPORTED_CURRENCIES.includes(currency)) {
      return json({ error: `Currency ${currency} not supported for Stripe top-up` }, 400);
    }
    if (amount < 5 || amount > 5000) {
      return json({ error: "Amount must be between 5 and 5,000" }, 400);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Verify wallet ownership and currency match
    const { data: wallet } = await admin
      .from("wallets")
      .select("id, user_id, currency_code")
      .eq("id", walletId)
      .single();
    if (!wallet || wallet.user_id !== userId) return json({ error: "Wallet not found" }, 404);
    if (wallet.currency_code !== currency) {
      return json({ error: `Wallet currency (${wallet.currency_code}) does not match payment currency (${currency})` }, 400);
    }

    const amountMinor = Math.round(amount * 100);
    const platformFeeMinor = Math.round(amountMinor * FEE_PCT) + (FEE_FIXED_MINOR[currency] || 30);
    const totalChargeMinor = amountMinor + platformFeeMinor;

    // Create payin session record first (so webhook has reference)
    const { data: sessionRow, error: insErr } = await admin
      .from("stripe_payin_sessions")
      .insert({
        user_id: userId,
        wallet_id: walletId,
        amount_minor: totalChargeMinor,
        currency_code: currency,
        platform_fee_minor: platformFeeMinor,
        credit_amount: amount,
        credit_currency: currency,
        status: "pending",
        metadata: { source: "topup" },
      })
      .select("id")
      .single();
    if (insErr || !sessionRow) return json({ error: insErr?.message || "Failed to create session" }, 500);

    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      // Empty payment_method_types triggers Stripe's automatic methods.
      // For broadest international acceptance, omit and let Stripe decide.
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `eFinMoney wallet top-up — ${currency} ${amount.toFixed(2)}`,
              description: `Includes ${(platformFeeMinor / 100).toFixed(2)} ${currency} processing fee`,
            },
            unit_amount: totalChargeMinor,
          },
          quantity: 1,
        },
      ],
      success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      customer_email: userData.user.email || undefined,
      metadata: {
        payin_session_id: sessionRow.id,
        user_id: userId,
        wallet_id: walletId,
        credit_amount: amount.toString(),
        credit_currency: currency,
      },
      payment_intent_data: {
        metadata: {
          payin_session_id: sessionRow.id,
          user_id: userId,
          wallet_id: walletId,
        },
      },
    });

    await admin
      .from("stripe_payin_sessions")
      .update({ stripe_session_id: checkout.id })
      .eq("id", sessionRow.id);

    return json({ url: checkout.url, session_id: checkout.id });
  } catch (e) {
    console.error("stripe-create-checkout-session error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
