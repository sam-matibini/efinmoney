// Stripe webhook for international wallet top-ups (Checkout sessions).
// Verifies signature with STRIPE_PAYIN_WEBHOOK_SECRET, then on
// `checkout.session.completed` posts double-entry ledger to credit the
// user's wallet and record platform top-up fee revenue.
//
// On `charge.refunded`, reverses the ledger entries.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.3.1?target=denonext";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-11-20.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, stripe-signature, content-type",
};

const WEBHOOK_SECRET = Deno.env.get("STRIPE_PAYIN_WEBHOOK_SECRET") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    if (!sig || !WEBHOOK_SECRET) throw new Error("Missing signature or secret");
    event = await stripe.webhooks.constructEventAsync(raw, sig, WEBHOOK_SECRET);
  } catch (e) {
    console.error("Webhook signature verification failed:", e);
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const payinId = session.metadata?.payin_session_id;
      if (!payinId) {
        console.warn("Checkout session missing payin_session_id metadata", session.id);
        return ok();
      }
      if (session.payment_status !== "paid") return ok();

      // Load payin row
      const { data: payin } = await admin
        .from("stripe_payin_sessions")
        .select("*")
        .eq("id", payinId)
        .single();
      if (!payin) return ok();
      if (payin.status === "succeeded") return ok(); // idempotent

      // Idempotency on ledger
      const externalRef = session.payment_intent as string || session.id;
      const { data: existing } = await admin
        .from("ledger_entries")
        .select("id")
        .eq("reference_type", "stripe_topup")
        .eq("external_reference", externalRef)
        .limit(1);
      if (existing && existing.length > 0) {
        await admin.from("stripe_payin_sessions").update({
          status: "succeeded",
          stripe_payment_intent_id: externalRef,
        }).eq("id", payinId);
        return ok();
      }

      const currency = payin.credit_currency;
      const creditAmount = Number(payin.credit_amount);
      const feeAmount = Number(payin.platform_fee_minor) / 100;
      const totalDebit = creditAmount + feeAmount;

      // Get accounts
      const { data: stripeAsset } = await admin
        .from("ledger_accounts").select("id")
        .eq("currency_code", currency)
        .ilike("name", "Stripe Settlement%")
        .limit(1).maybeSingle();
      const { data: liabAcc } = await admin
        .from("ledger_accounts").select("id")
        .like("code", "21%")
        .eq("currency_code", currency)
        .ilike("name", "Customer Wallet Liability%")
        .limit(1).maybeSingle();
      const { data: feeAcc } = await admin
        .from("ledger_accounts").select("id")
        .eq("code", "4250").limit(1).maybeSingle();

      if (!stripeAsset || !liabAcc || !feeAcc) {
        console.error("Missing ledger accounts for", currency);
        await admin.from("stripe_payin_sessions").update({
          status: "failed",
          failure_reason: `Ledger accounts missing for ${currency}`,
        }).eq("id", payinId);
        return ok();
      }

      const journalId = crypto.randomUUID();
      const desc = `Stripe Checkout top-up (${externalRef})`;
      const entries = [
        // Debit Stripe settlement (asset) — total amount we received
        { journal_id: journalId, account_id: stripeAsset.id, wallet_id: null, currency_code: currency,
          debit_amount: totalDebit, credit_amount: 0, description: desc,
          reference_type: "stripe_topup", external_reference: externalRef, created_by: payin.user_id },
        // Credit user wallet liability — net amount they get
        { journal_id: journalId, account_id: liabAcc.id, wallet_id: payin.wallet_id, currency_code: currency,
          debit_amount: 0, credit_amount: creditAmount, description: desc,
          reference_type: "stripe_topup", external_reference: externalRef, created_by: payin.user_id },
        // Credit top-up fee revenue
        ...(feeAmount > 0 ? [{
          journal_id: journalId, account_id: feeAcc.id, wallet_id: null, currency_code: currency,
          debit_amount: 0, credit_amount: feeAmount, description: `${desc} — fee`,
          reference_type: "stripe_topup_fee", external_reference: externalRef, created_by: payin.user_id,
        }] : []),
      ];

      const { error: ledgerErr } = await admin.from("ledger_entries").insert(entries);
      if (ledgerErr) {
        console.error("Ledger insert failed:", ledgerErr);
        await admin.from("stripe_payin_sessions").update({
          status: "failed",
          failure_reason: ledgerErr.message,
        }).eq("id", payinId);
        return ok();
      }

      await admin.from("stripe_payin_sessions").update({
        status: "succeeded",
        stripe_payment_intent_id: externalRef,
      }).eq("id", payinId);

      await admin.from("notifications").insert({
        user_id: payin.user_id,
        title: "Top-up successful",
        message: `Your wallet was credited with ${currency} ${creditAmount.toFixed(2)}.`,
        type: "transfer",
      });

      return ok();
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const payinId = charge.metadata?.payin_session_id;
      if (!payinId) return ok();
      const { data: payin } = await admin
        .from("stripe_payin_sessions").select("*").eq("id", payinId).single();
      if (!payin || payin.status === "refunded") return ok();

      // Reverse the original entries with opposite-sign credit
      const currency = payin.credit_currency;
      const creditAmount = Number(payin.credit_amount);
      const externalRef = charge.payment_intent as string;

      const { data: liabAcc } = await admin
        .from("ledger_accounts").select("id")
        .like("code", "21%")
        .eq("currency_code", currency)
        .ilike("name", "Customer Wallet Liability%")
        .limit(1).maybeSingle();
      const { data: stripeAsset } = await admin
        .from("ledger_accounts").select("id")
        .eq("currency_code", currency)
        .ilike("name", "Stripe Settlement%")
        .limit(1).maybeSingle();

      if (liabAcc && stripeAsset) {
        const journalId = crypto.randomUUID();
        await admin.from("ledger_entries").insert([
          { journal_id: journalId, account_id: liabAcc.id, wallet_id: payin.wallet_id, currency_code: currency,
            debit_amount: creditAmount, credit_amount: 0,
            description: `Refund — Stripe top-up reversal (${externalRef})`,
            reference_type: "stripe_topup_refund", external_reference: externalRef, created_by: payin.user_id },
          { journal_id: journalId, account_id: stripeAsset.id, wallet_id: null, currency_code: currency,
            debit_amount: 0, credit_amount: creditAmount,
            description: `Refund — Stripe top-up reversal (${externalRef})`,
            reference_type: "stripe_topup_refund", external_reference: externalRef, created_by: payin.user_id },
        ]);
      }

      await admin.from("stripe_payin_sessions").update({ status: "refunded" }).eq("id", payinId);
      return ok();
    }

    return ok();
  } catch (e) {
    console.error("stripe-payin-webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function ok() {
  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
