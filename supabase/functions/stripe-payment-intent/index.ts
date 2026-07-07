import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.3.1?target=denonext";
import { corsHeaders, corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

function getStripeClient(): Stripe {
  const secret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(secret, {
    apiVersion: "2024-11-20.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function publishableKeyResponse() {
  const pk = Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "";
  if (!pk.startsWith("pk_test_") && !pk.startsWith("pk_live_")) {
    return jsonResponse({
      error: "Stripe publishable key is not configured correctly. Expected a value starting with pk_test_ or pk_live_.",
    }, 500);
  }
  return jsonResponse({ publishableKey: pk });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const url = new URL(req.url);

    if (req.method === "GET" && url.searchParams.get("action") === "publishable_key") {
      return publishableKeyResponse();
    }

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    if (body.action === "publishable_key") {
      return publishableKeyResponse();
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { action } = body;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const stripe = getStripeClient();

    if (action === "create") {
      const { amount, currency, walletId } = body as {
        amount?: number;
        currency?: string;
        walletId?: string;
      };
      if (!amount || amount <= 0 || !currency || !walletId) {
        return jsonResponse({ error: "Invalid input" }, 400);
      }
      if (amount > 999999.99) {
        return jsonResponse({ error: "Amount must be no more than $999,999.99 per transaction" }, 400);
      }

      const { data: wallet } = await admin
        .from("wallets")
        .select("id, user_id, currency_code")
        .eq("id", walletId)
        .single();
      if (!wallet || wallet.user_id !== userId) {
        return jsonResponse({ error: "Wallet not found" }, 404);
      }

      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        payment_method_types: ["card"],
        payment_method_options: {
          card: {
            // Virtual / international cards (e.g. Grey, Wise) often need 3DS — do not block redirects.
            request_three_d_secure: "automatic",
          },
        },
        receipt_email: userData.user.email || undefined,
        metadata: { user_id: userId, wallet_id: walletId, purpose: "wallet_topup" },
      });

      return jsonResponse({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
    }

    if (action === "confirm") {
      const { paymentIntentId } = body as { paymentIntentId?: string };
      if (!paymentIntentId) return jsonResponse({ error: "paymentIntentId required" }, 400);

      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status !== "succeeded") {
        return jsonResponse({ error: `Payment not completed (${intent.status})` }, 400);
      }
      if (intent.metadata.user_id !== userId) {
        return jsonResponse({ error: "Unauthorized" }, 403);
      }

      const walletId = intent.metadata.wallet_id;
      const amount = intent.amount / 100;
      const currency = intent.currency.toUpperCase();

      const { data: existing } = await admin
        .from("ledger_entries")
        .select("id")
        .eq("reference_type", "stripe_topup")
        .eq("external_reference", intent.id)
        .limit(1);
      if (existing && existing.length > 0) {
        return jsonResponse({ success: true, alreadyProcessed: true });
      }

      const { data: stripeAsset } = await admin
        .from("ledger_accounts")
        .select("id")
        .eq("currency_code", currency)
        .ilike("name", "Stripe Settlement%")
        .limit(1)
        .maybeSingle();
      const { data: liabAcc } = await admin
        .from("ledger_accounts")
        .select("id")
        .like("code", "21%")
        .eq("currency_code", currency)
        .ilike("name", "Customer Wallet Liability%")
        .limit(1)
        .maybeSingle();

      if (!stripeAsset || !liabAcc) {
        return jsonResponse({ error: `Ledger accounts missing for ${currency}` }, 500);
      }

      const journalId = crypto.randomUUID();
      const desc = `Stripe top-up (${intent.id}) — wallet_topup`;
      const entries = [
        {
          journal_id: journalId,
          account_id: stripeAsset.id,
          wallet_id: null,
          currency_code: currency,
          debit_amount: amount,
          credit_amount: 0,
          description: desc,
          reference_type: "stripe_topup",
          external_reference: intent.id,
          created_by: userId,
        },
        {
          journal_id: journalId,
          account_id: liabAcc.id,
          wallet_id: walletId,
          currency_code: currency,
          debit_amount: 0,
          credit_amount: amount,
          description: desc,
          reference_type: "stripe_topup",
          external_reference: intent.id,
          created_by: userId,
        },
      ];

      const { error: ledgerErr } = await admin.from("ledger_entries").insert(entries);
      if (ledgerErr) return jsonResponse({ error: ledgerErr.message }, 500);

      try {
        await admin.from("notifications").insert({
          user_id: userId,
          title: "Top-up successful",
          message: `Your ${currency} top-up of ${amount.toFixed(2)} was successful.`,
          type: "transfer",
        });
      } catch (e) {
        console.warn("notification insert failed", e);
      }

      return jsonResponse({ success: true, amount, currency });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("stripe-payment-intent error:", e);
    const msg = (e as Error).message ?? "Unknown error";
    const status = /amount_too_large|no more than/i.test(msg) ? 400 : 500;
    return jsonResponse({ error: msg }, status);
  }
});

// Keep corsHeaders exported for any tooling that references it.
export { corsHeaders };
