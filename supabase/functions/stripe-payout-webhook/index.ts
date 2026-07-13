// Stripe webhook for payout events on connected accounts.
// Subscribe to: payout.paid, payout.failed, payout.canceled
// Uses STRIPE_PAYOUT_WEBHOOK_SECRET (separate from top-up webhook).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@13.9.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("STRIPE_PAYOUT_WEBHOOK_SECRET") || "";

async function refundWallet(supabase: any, transfer: any) {
  if (!transfer) return;
  // Idempotency: don't refund twice
  const { data: existing } = await supabase
    .from("ledger_entries").select("id")
    .eq("reference_type", "transfer_refund")
    .eq("reference_id", transfer.id)
    .limit(1);
  if (existing && existing.length) return;

  const { data: liabAcc } = await supabase
    .from("ledger_accounts").select("id")
    .like("code", "21%")
    .eq("currency_code", transfer.source_currency)
    .limit(1).single();
  if (!liabAcc) return;

  await supabase.from("ledger_entries").insert([{
    journal_id: crypto.randomUUID(),
    account_id: liabAcc.id,
    wallet_id: transfer.sender_wallet_id,
    currency_code: transfer.source_currency,
    debit_amount: 0,
    credit_amount: Number(transfer.source_amount) + Number(transfer.fee_amount || 0),
    description: `Refund — Stripe payout reversed for transfer ${transfer.id}`,
    reference_type: "transfer_refund",
    reference_id: transfer.id,
    created_by: transfer.sender_id,
  }]);
}

Deno.serve(async (req) => {
  const { isStripeEnabled, stripeDisabledResponse } = await import("../_shared/stripe-guard.ts");
  if (!isStripeEnabled()) return stripeDisabledResponse();

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  if (!sig || !WEBHOOK_SECRET) {
    console.error("Missing stripe signature or webhook secret");
    return new Response(JSON.stringify({ error: "Missing signature" }), { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature failed:", (err as Error).message);
    return new Response(JSON.stringify({ error: "Bad signature" }), { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (
      event.type === "payout.paid" ||
      event.type === "payout.failed" ||
      event.type === "payout.canceled"
    ) {
      const payout = event.data.object as Stripe.Payout;
      const transferId = (payout.metadata as any)?.transfer_id;
      if (!transferId) {
        console.warn("Payout has no transfer_id metadata:", payout.id);
        return new Response(JSON.stringify({ received: true }));
      }

      const { data: transfer } = await supabase
        .from("transfers").select("*").eq("id", transferId).maybeSingle();

      if (event.type === "payout.paid") {
        await supabase.from("transfers").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          provider_reference: payout.id,
        }).eq("id", transferId);
      } else {
        // failed or canceled
        const reason = payout.failure_message ||
          (event.type === "payout.canceled" ? "Payout canceled" : "Payout failed");
        await refundWallet(supabase, transfer);
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: reason,
        }).eq("id", transferId);
      }
    } else {
      console.log("Unhandled stripe event:", event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("stripe-payout-webhook handler error", err);
    return new Response(JSON.stringify({ error: "handler error" }), { status: 500 });
  }
});
