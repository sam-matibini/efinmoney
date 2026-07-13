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
  const { isStripeEnabled, stripeDisabledResponse } = await import("../_shared/stripe-guard.ts");
  if (!isStripeEnabled()) return stripeDisabledResponse();

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expectedSecret = SUPABASE_SERVICE_ROLE_KEY;
  if (!expectedSecret || req.headers.get("x-internal-secret") !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const {
      transfer_id,
      card_token,
      recipient_email,
      last4,
      brand,
      recipient_kyc,
      recipient_tos,
      client_ip,
    } = body || {};

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

    // Stripe card-push corridor allow-list. CA was the original corridor;
    // extended here to US/UK/EU-27 where Stripe Visa Direct is available.
    const EU_27 = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"];
    const CORRIDOR: Record<string, { country: string; currency: string }> = {
      CA: { country: "CA", currency: "cad" },
      US: { country: "US", currency: "usd" },
      GB: { country: "GB", currency: "gbp" },
    };
    for (const c of EU_27) CORRIDOR[c] = { country: c, currency: "eur" };

    const corridor = CORRIDOR[transfer.recipient_country];
    if (!corridor || transfer.target_currency.toLowerCase() !== corridor.currency) {
      return new Response(JSON.stringify({
        error: `Stripe card-push not supported for ${transfer.recipient_country} → ${transfer.target_currency}`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    if (corridor.country === "CA" && !recipient_kyc) {
      return new Response(JSON.stringify({
        success: false,
        error: "Recipient identity details are required for Canadian debit-card payouts.",
        code: "missing_recipient_kyc",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const amountCents = Math.round(Number(transfer.target_amount) * 100);
    const recipientName = transfer.recipient_name || "Recipient";
    const senderId = transfer.sender_id;
    const recEmail = recipient_email || transfer.recipient_account || null;

    try {
      let acctId: string | null = null;
      let externalAccountId: string | null = null;
      const kyc = recipient_kyc;
      const ip = String(client_ip || "0.0.0.0");

      // Reuse vaulted recipient only when we are not supplying fresh KYC (legacy int'l sends).
      if (recEmail && !kyc) {
        const { data: existing } = await supabase
          .from("stripe_payout_recipients")
          .select("*")
          .eq("user_id", senderId)
          .eq("recipient_email", recEmail)
          .maybeSingle();
        if (existing) acctId = existing.stripe_account_id;
      }

      if (!acctId) {
        const acctCountry = String(kyc?.address?.country || corridor.country).toUpperCase();
        const cleanPostal = kyc?.address?.postal_code
          ? String(kyc.address.postal_code).toUpperCase().replace(/\s+/g, "")
          : undefined;
        const acct = await stripe.accounts.create({
          type: "custom",
          country: acctCountry,
          business_type: "individual",
          capabilities: {
            transfers: { requested: true },
          },
          individual: {
            first_name: recipientName.split(/\s+/)[0] || "Recipient",
            last_name: recipientName.split(/\s+/).slice(1).join(" ") || recipientName,
            email: recEmail || undefined,
            ...(kyc ? {
              phone: String(kyc.phone),
              dob: { day: kyc.dob.day, month: kyc.dob.month, year: kyc.dob.year },
              address: {
                line1: String(kyc.address.line1),
                city: String(kyc.address.city),
                ...(kyc.address.state ? { state: String(kyc.address.state).toUpperCase() } : {}),
                postal_code: cleanPostal!,
                country: acctCountry,
              },
            } : {}),
          },
          business_profile: kyc ? {
            mcc: "6012",
            product_description: "Personal payment received via eFinMoney",
            url: "https://efin.money",
          } : undefined,
          ...(kyc && recipient_tos?.accepted ? {
            tos_acceptance: {
              date: Math.floor(Date.now() / 1000),
              ip,
            },
          } : {}),
          metadata: { sender_id: senderId, transfer_id: transfer.id, corridor: corridor.country },
        });
        acctId = acct.id;
      }

      const ext = await stripe.accounts.createExternalAccount(acctId!, {
        external_account: card_token,
        default_for_currency: true,
      } as any);
      externalAccountId = ext.id;

      if (kyc) {
        let capActive = false;
        for (let i = 0; i < 6; i++) {
          const fresh = await stripe.accounts.retrieve(acctId!);
          if ((fresh.capabilities as any)?.transfers === "active") { capActive = true; break; }
          await new Promise((r) => setTimeout(r, 1000));
        }
        if (!capActive) {
          const fresh = await stripe.accounts.retrieve(acctId!);
          const due = (fresh.requirements as any)?.currently_due || [];
          throw new Error(due.length
            ? `Card payouts could not be enabled. Check: ${due.join(", ")}`
            : "Card payouts could not be enabled for this recipient.");
        }
      }

      // Persist recipient vault (insert new, or update existing if we reused acct)
      if (recEmail) {
        const { data: existingRow } = await supabase
          .from("stripe_payout_recipients")
          .select("id")
          .eq("user_id", senderId)
          .eq("recipient_email", recEmail)
          .maybeSingle();
        const row = {
          user_id: senderId,
          recipient_name: recipientName,
          recipient_email: recEmail,
          last4: last4 || null,
          brand: brand || null,
          stripe_account_id: acctId!,
          stripe_external_account_id: externalAccountId,
        };
        if (existingRow) {
          await supabase.from("stripe_payout_recipients").update(row).eq("id", existingRow.id);
        } else {
          await supabase.from("stripe_payout_recipients").insert(row);
        }
      }

      // 3. Create instant payout to the debit card on the connected account
      const payout = await stripe.payouts.create(
        {
          amount: amountCents,
          currency: corridor.currency,
          method: "instant",
          destination: externalAccountId!,
          metadata: { transfer_id: transfer.id, sender_id: senderId, corridor: corridor.country },
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
