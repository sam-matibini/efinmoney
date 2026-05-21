import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

// Public endpoint — verifies Stripe signature in code.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_ISSUING_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) return new Response("Not configured", { status: 500 });

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as any });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, webhookSecret);
  } catch (e: any) {
    console.error("Webhook signature verification failed:", e?.message);
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    switch (event.type) {
      case "issuing_authorization.request": {
        const auth = event.data.object as any;
        // Real-time: approve/decline within 2 seconds
        const { data: card } = await admin
          .from("issued_cards")
          .select("id, user_id, status, currency, funding_wallet_id")
          .eq("stripe_card_id", auth.card.id)
          .maybeSingle();

        let approved = false;
        let reason = "card_not_found";
        if (card) {
          if (card.status !== "active") {
            reason = `card_${card.status}`;
          } else if (card.funding_wallet_id) {
            const { data: bal } = await admin.rpc("get_wallet_balance", { p_wallet_id: card.funding_wallet_id });
            const required = Math.abs(auth.amount) / 100;
            if (Number(bal || 0) >= required) {
              approved = true;
              reason = "approved";
            } else {
              reason = "insufficient_funds";
            }
          } else {
            reason = "no_funding_wallet";
          }
        }

        await admin.from("card_authorizations").insert({
          card_id: card?.id || null,
          user_id: card?.user_id || null,
          stripe_authorization_id: auth.id,
          amount: Math.abs(auth.amount) / 100,
          currency: (auth.currency || "cad").toUpperCase(),
          merchant_name: auth.merchant_data?.name,
          merchant_category: auth.merchant_data?.category,
          merchant_country: auth.merchant_data?.country,
          status: approved ? "approved" : "declined",
          decline_reason: approved ? null : reason,
          approved_at: approved ? new Date().toISOString() : null,
          declined_at: approved ? null : new Date().toISOString(),
          raw_payload: auth,
        });

        if (approved) {
          await stripe.issuing.authorizations.approve(auth.id);
        } else {
          await stripe.issuing.authorizations.decline(auth.id, { metadata: { reason } });
        }
        break;
      }
      case "issuing_transaction.created": {
        const txn = event.data.object as any;
        const { data: card } = await admin.from("issued_cards").select("id, user_id, currency").eq("stripe_card_id", txn.card).maybeSingle();
        if (card) {
          await admin.from("card_transactions").insert({
            card_id: card.id,
            user_id: card.user_id,
            stripe_transaction_id: txn.id,
            amount: Math.abs(txn.amount) / 100,
            currency: (txn.currency || card.currency).toUpperCase(),
            merchant_name: txn.merchant_data?.name,
            merchant_category: txn.merchant_data?.category,
            mcc: txn.merchant_data?.category_code,
            posted_at: new Date((txn.created || Date.now() / 1000) * 1000).toISOString(),
            raw_payload: txn,
          });
        }
        break;
      }
      case "issuing_card.updated": {
        const c = event.data.object as any;
        const stripeStatusMap: Record<string, string> = { active: "active", inactive: "frozen", canceled: "cancelled" };
        await admin.from("issued_cards")
          .update({ status: stripeStatusMap[c.status] || "active" })
          .eq("stripe_card_id", c.id);
        break;
      }
    }
  } catch (e: any) {
    console.error("Webhook handler error:", e);
    return new Response(`Handler error: ${e?.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
