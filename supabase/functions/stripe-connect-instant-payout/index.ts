// Stripe Connect — instant payout to the sender's OWN connected account.
// Used by execute-transfer when payout_method === 'stripe_connect'.
// Internal-only: requires x-internal-secret header == SERVICE_ROLE_KEY.
//
// Flow:
//   1) Load transfer + sender's stripe_connected_accounts row.
//   2) Stripe Transfer (platform balance -> connected account).
//   3) Stripe Instant Payout on the connected account (Stripe-Account header).
//   4) On error, refund the sender wallet and mark transfer failed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@13.9.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

function friendly(err: any): { reason: string; code: string } {
  const code = err?.code || err?.raw?.code || err?.type || "stripe_error";
  const msg = (err?.message || err?.raw?.message || "Stripe transfer failed");
  const m = msg.toLowerCase();
  if (m.includes("insufficient") && m.includes("funds")) {
    return { code, reason: "Platform Stripe balance is too low to fund this test transfer. Top up the test balance in Stripe and try again." };
  }
  if (m.includes("payouts_not_allowed") || m.includes("not allowed to make payouts") || m.includes("capability")) {
    return { code, reason: "Your connected account isn't fully enabled for payouts yet. Finish onboarding at /stripe-connect and try again." };
  }
  if (m.includes("no external account") || m.includes("external account") || m.includes("no payout method")) {
    return { code, reason: "Your connected account has no external debit card/bank on file. Add one in onboarding and try again." };
  }
  return { code, reason: msg };
}

async function refundWallet(supabase: any, transfer: any) {
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
    description: `Refund — Stripe Connect instant payout failed for transfer ${transfer.id}`,
    reference_type: "transfer_refund",
    reference_id: transfer.id,
    created_by: transfer.sender_id,
  }]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.headers.get("x-internal-secret") !== SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { transfer_id } = await req.json();
    if (!transfer_id) {
      return new Response(JSON.stringify({ error: "transfer_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: transfer, error: tErr } = await supabase
      .from("transfers").select("*").eq("id", transfer_id).single();
    if (tErr || !transfer) {
      return new Response(JSON.stringify({ error: "Transfer not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (transfer.recipient_country !== "CA" || (transfer.target_currency || "").toUpperCase() !== "CAD") {
      return new Response(JSON.stringify({ error: "Only CAD→CA supported for stripe_connect" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: acct } = await supabase
      .from("stripe_connected_accounts")
      .select("*")
      .eq("user_id", transfer.sender_id)
      .maybeSingle();

    if (!acct?.stripe_account_id) {
      await refundWallet(supabase, transfer);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: "No Stripe connected account. Set one up at /stripe-connect.",
      }).eq("id", transfer.id);
      return new Response(JSON.stringify({
        success: false,
        refunded: true,
        error: "No Stripe connected account. Set one up at /stripe-connect.",
        code: "no_connected_account",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const acctId: string = acct.stripe_account_id;
    const amountCents = Math.round(Number(transfer.target_amount) * 100);
    const currency = "cad";

    try {
      // 1) Platform → connected account
      const tr = await stripe.transfers.create({
        amount: amountCents,
        currency,
        destination: acctId,
        metadata: { transfer_id: transfer.id, sender_id: transfer.sender_id, kind: "stripe_connect_self" },
      });

      // 2) Instant payout on the connected account
      let payoutId: string | null = null;
      let payoutStatus = "pending";
      try {
        const payout = await stripe.payouts.create(
          {
            amount: amountCents,
            currency,
            method: "instant",
            metadata: { transfer_id: transfer.id, sender_id: transfer.sender_id },
          },
          { stripeAccount: acctId },
        );
        payoutId = payout.id;
        payoutStatus = payout.status;
      } catch (poErr: any) {
        // Fall back to standard payout if instant isn't available (e.g. no debit-card external account yet).
        console.warn("Instant payout failed, retrying with standard:", poErr?.message);
        const payout = await stripe.payouts.create(
          {
            amount: amountCents,
            currency,
            method: "standard",
            metadata: { transfer_id: transfer.id, sender_id: transfer.sender_id, fallback: "instant_unavailable" },
          },
          { stripeAccount: acctId },
        );
        payoutId = payout.id;
        payoutStatus = payout.status;
      }

      await supabase.from("transfers").update({
        status: "processing",
        provider_reference: payoutId,
      }).eq("id", transfer.id);

      return new Response(JSON.stringify({
        success: true,
        stripe_transfer_id: tr.id,
        stripe_payout_id: payoutId,
        status: payoutStatus,
        connected_account: acctId,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err: any) {
      console.error("stripe-connect-instant-payout error:", err?.message, err?.raw || err);
      const { reason, code } = friendly(err);
      await refundWallet(supabase, transfer);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: reason,
      }).eq("id", transfer.id);
      return new Response(JSON.stringify({
        success: false,
        error: reason,
        code,
        refunded: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("stripe-connect-instant-payout fatal", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
