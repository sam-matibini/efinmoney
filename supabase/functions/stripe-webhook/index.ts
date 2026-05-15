// Stripe webhook receiver
// Verifies signature, idempotently posts ledger entries for completed PaymentIntents,
// and updates linked transfer status. Public endpoint (no JWT) — secured by Stripe signature.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.3.1?target=denonext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-11-20.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const sig = req.headers.get("stripe-signature");
  const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!sig || !whSecret) return json({ error: "Missing signature or secret" }, 400);

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, whSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error("Webhook signature verification failed:", (err as Error).message);
    return json({ error: "Invalid signature" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Idempotency by event id
  try {
    const { data: seen } = await admin
      .from("ledger_entries")
      .select("id")
      .eq("external_reference", event.id)
      .limit(1);
    if (seen && seen.length > 0) return json({ received: true, duplicate: true });
  } catch (_) { /* table may not have this exact event id; continue */ }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await postTopupLedger(admin, pi);
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const transferId = pi.metadata?.transfer_id;
        if (transferId) {
          await admin.from("transfers")
            .update({ status: "failed", failure_reason: pi.last_payment_error?.message ?? "Payment failed" })
            .eq("id", transferId);
        }
        if (pi.metadata?.user_id) {
          await admin.from("notifications").insert({
            user_id: pi.metadata.user_id,
            title: "Payment failed",
            message: pi.last_payment_error?.message ?? "Your card payment failed.",
            type: "transfer",
          });
        }
        break;
      }
      case "charge.refunded":
      case "charge.dispute.created": {
        console.log(`Stripe event ${event.type}:`, event.id);
        break;
      }
      default:
        console.log("Unhandled stripe event:", event.type);
    }
  } catch (e) {
    console.error("Webhook handler error:", e);
    return json({ error: (e as Error).message }, 500);
  }

  return json({ received: true });
});

async function postTopupLedger(admin: any, intent: Stripe.PaymentIntent) {
  const userId = intent.metadata?.user_id;
  const walletId = intent.metadata?.wallet_id;
  if (!userId || !walletId) {
    console.warn("PaymentIntent missing metadata, skipping ledger:", intent.id);
    return;
  }
  const amount = intent.amount / 100;
  const currency = intent.currency.toUpperCase();

  // Idempotency by PaymentIntent id
  const { data: existing } = await admin
    .from("ledger_entries")
    .select("id")
    .eq("reference_type", "stripe_topup")
    .eq("external_reference", intent.id)
    .limit(1);
  if (existing && existing.length > 0) return;

  const { data: stripeAsset } = await admin
    .from("ledger_accounts").select("id")
    .eq("currency_code", currency).ilike("name", "Stripe Settlement%")
    .limit(1).maybeSingle();
  const { data: liabAcc } = await admin
    .from("ledger_accounts").select("id")
    .like("code", "21%").eq("currency_code", currency)
    .ilike("name", "Customer Wallet Liability%")
    .limit(1).maybeSingle();
  if (!stripeAsset || !liabAcc) {
    console.error(`Missing ledger accounts for ${currency}`);
    return;
  }

  const journalId = crypto.randomUUID();
  const desc = `Stripe top-up (${intent.id}) — ${intent.metadata?.purpose ?? "wallet_topup"}`;
  await admin.from("ledger_entries").insert([
    {
      journal_id: journalId, account_id: stripeAsset.id, wallet_id: null,
      currency_code: currency, debit_amount: amount, credit_amount: 0,
      description: desc, reference_type: "stripe_topup",
      external_reference: intent.id, created_by: userId,
    },
    {
      journal_id: journalId, account_id: liabAcc.id, wallet_id: walletId,
      currency_code: currency, debit_amount: 0, credit_amount: amount,
      description: desc, reference_type: "stripe_topup",
      external_reference: intent.id, created_by: userId,
    },
  ]);

  await admin.from("notifications").insert({
    user_id: userId,
    title: "Top-up successful",
    message: `Your ${currency} top-up of ${amount.toFixed(2)} was successful.`,
    type: "transfer",
  });
}
