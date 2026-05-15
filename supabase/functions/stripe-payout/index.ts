// Stripe Card Push payout (Visa Direct / Mastercard Send) for Canadian recipients.
// Mirrors the contract of paysafe-payout: input { transfer_id, card_token?, recipient_email?, last4?, brand? }
// Returns { success, error?, code?, refunded?, stripe_payout_id?, status? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@13.9.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

function friendlyStripeError(err: any): { reason: string; code: string } {
  const code = err?.code || err?.raw?.code || err?.type || "stripe_error";
  const msg = (err?.message || err?.raw?.message || "Stripe payout failed").toLowerCase();

  if (
    code === "payouts_not_allowed" ||
    code === "insufficient_capabilities" ||
    msg.includes("capability") ||
    msg.includes("not allowed to make payouts") ||
    msg.includes("card payouts")
  ) {
    return {
      code,
      reason:
        "Card payouts are not yet enabled on our payments provider. Your funds have been returned to your wallet. Please try again later or contact support.",
    };
  }
  if (code === "card_declined" || msg.includes("card was declined") || msg.includes("declined")) {
    return {
      code,
      reason: "The recipient's debit card was declined. Your funds have been returned to your wallet.",
    };
  }
  if (msg.includes("debit card") || msg.includes("non-debit") || code === "external_account_invalid") {
    return {
      code,
      reason: "Only Canadian debit cards can receive instant payouts. Please ask the recipient for a debit card.",
    };
  }
  if (msg.includes("insufficient funds") || code === "balance_insufficient") {
    return {
      code,
      reason: "Card payouts are temporarily unavailable due to a provider balance issue. Your funds have been returned.",
    };
  }
  return {
    code,
    reason: err?.message || err?.raw?.message || "Stripe payout failed. Your funds have been returned to your wallet.",
  };
}

async function refundWallet(supabase: any, transfer: any) {
  // Reverse the original debit by inserting a credit entry against the same wallet
  // referencing the transfer. Mirrors how paysafe-payout's refund is structured via
  // ledger_entries (the existing pattern in execute-transfer posts a debit on send).
  const { data: liabAcc } = await supabase
    .from("ledger_accounts")
    .select("id")
    .like("code", "21%")
    .eq("currency_code", transfer.source_currency)
    .limit(1)
    .single();

  if (!liabAcc) return;

  const journalId = crypto.randomUUID();
  await supabase.from("ledger_entries").insert([{
    journal_id: journalId,
    account_id: liabAcc.id,
    wallet_id: transfer.sender_wallet_id,
    currency_code: transfer.source_currency,
    debit_amount: 0,
    credit_amount: Number(transfer.source_amount) + Number(transfer.fee_amount || 0),
    description: `Refund — Stripe payout failed for transfer ${transfer.id}`,
    reference_type: "transfer_refund",
    reference_id: transfer.id,
    created_by: transfer.sender_id,
  }]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { transfer_id, card_token, recipient_email, last4, brand } = body || {};

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

    if (transfer.recipient_country !== "CA" || transfer.target_currency !== "CAD") {
      return new Response(JSON.stringify({ error: "Stripe card-push only supports CAD/CA" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (transfer.payout_method !== "card_push") {
      return new Response(JSON.stringify({ error: `Unsupported payout_method ${transfer.payout_method}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!card_token) {
      return new Response(JSON.stringify({ error: "card_token required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountCents = Math.round(Number(transfer.target_amount) * 100);
    const recipientName = transfer.recipient_name || "Recipient";
    const senderId = transfer.sender_id;
    const recEmail = recipient_email || transfer.recipient_account || null;

    try {
      // 1. Find or create a Stripe Custom connected account for this (sender, recipient_email)
      let acctId: string | null = null;
      let externalAccountId: string | null = null;

      if (recEmail) {
        const { data: existing } = await supabase
          .from("stripe_payout_recipients")
          .select("*")
          .eq("user_id", senderId)
          .eq("recipient_email", recEmail)
          .maybeSingle();
        if (existing) {
          acctId = existing.stripe_account_id;
        }
      }

      if (!acctId) {
        const acct = await stripe.accounts.create({
          type: "custom",
          country: "CA",
          business_type: "individual",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          individual: {
            first_name: recipientName.split(/\s+/)[0] || "Recipient",
            last_name: recipientName.split(/\s+/).slice(1).join(" ") || recipientName,
            email: recEmail || undefined,
          },
          metadata: { sender_id: senderId, transfer_id: transfer.id },
        });
        acctId = acct.id;
      }

      // 2. Attach the debit card as an external account on the connected account
      const ext = await stripe.accounts.createExternalAccount(acctId!, {
        external_account: card_token,
        default_for_currency: true,
      } as any);
      externalAccountId = ext.id;

      // Persist recipient vault (idempotent upsert by sender + email)
      if (recEmail) {
        await supabase.from("stripe_payout_recipients").upsert({
          user_id: senderId,
          recipient_name: recipientName,
          recipient_email: recEmail,
          last4: last4 || null,
          brand: brand || null,
          stripe_account_id: acctId!,
          stripe_external_account_id: externalAccountId,
        }, { onConflict: "user_id,recipient_email" } as any).select().maybeSingle();
      }

      // 3. Create instant payout to the debit card on the connected account
      const payout = await stripe.payouts.create(
        {
          amount: amountCents,
          currency: "cad",
          method: "instant",
          destination: externalAccountId!,
          metadata: { transfer_id: transfer.id, sender_id: senderId },
        },
        { stripeAccount: acctId! },
      );

      await supabase.from("transfers").update({
        status: "processing",
        provider_reference: payout.id,
        stripe_payout_id: payout.id,
      }).eq("id", transfer.id);

      return new Response(JSON.stringify({
        success: true,
        stripe_payout_id: payout.id,
        status: payout.status,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err: any) {
      console.error("Stripe payout error", err?.message, err?.raw || err);
      const { reason, code } = friendlyStripeError(err);
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
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err) {
    console.error("stripe-payout fatal", err);
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
