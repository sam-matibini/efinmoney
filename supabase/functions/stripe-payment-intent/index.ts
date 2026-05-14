import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.3.1?target=denonext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-11-20.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.get("action") === "publishable_key") {
      return json({ publishableKey: Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "" });
    }
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

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
    const { action } = body;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "create") {
      const { amount, currency, walletId } = body;
      if (!amount || amount <= 0 || !currency || !walletId) {
        return json({ error: "Invalid input" }, 400);
      }
      if (amount > 999999.99) {
        return json({ error: "Amount must be no more than $999,999.99 per transaction" }, 400);
      }

      // Verify wallet ownership
      const { data: wallet } = await admin
        .from("wallets")
        .select("id, user_id, currency_code")
        .eq("id", walletId)
        .single();
      if (!wallet || wallet.user_id !== userId) {
        return json({ error: "Wallet not found" }, 404);
      }

      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        metadata: { user_id: userId, wallet_id: walletId },
      });

      return json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
    }

    if (action === "confirm") {
      const { paymentIntentId } = body;
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (intent.status !== "succeeded") {
        return json({ error: `Payment not completed (${intent.status})` }, 400);
      }
      if (intent.metadata.user_id !== userId) {
        return json({ error: "Unauthorized" }, 403);
      }

      const walletId = intent.metadata.wallet_id;
      const amount = intent.amount / 100;
      const currency = intent.currency.toUpperCase();

      // Idempotency: skip if this PaymentIntent was already posted
      const { data: existing } = await admin
        .from("ledger_entries")
        .select("id")
        .eq("reference_type", "stripe_topup")
        .eq("external_reference", intent.id)
        .limit(1);
      if (existing && existing.length > 0) {
        return json({ success: true, alreadyProcessed: true });
      }

      // Dr Stripe Settlement (asset) / Cr Customer Wallet Liability (21xx)
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
        return json({ error: `Ledger accounts missing for ${currency}` }, 500);
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
      if (ledgerErr) return json({ error: ledgerErr.message }, 500);

      // Notify the user (best-effort)
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

      return json({ success: true, amount, currency });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("stripe-payment-intent error:", e);
    const msg = (e as Error).message ?? "Unknown error";
    const status = /amount_too_large|no more than/i.test(msg) ? 400 : 500;
    return json({ error: msg }, status);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
