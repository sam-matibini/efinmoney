// Charge the SENDER's debit/credit card via Stripe to fund a Canadian transfer.
// Input:  { transfer_id, card_token, amount_cents, currency? }
// Output: { success, charge_id?, error?, code? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@13.9.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

function friendlyChargeError(err: any): { reason: string; code: string } {
  const code = err?.code || err?.raw?.code || err?.type || "stripe_error";
  const msg = (err?.message || err?.raw?.message || "").toLowerCase();
  if (code === "card_declined" || msg.includes("declined")) {
    return { code, reason: "Your card was declined. No funds were taken — please try another card." };
  }
  if (code === "insufficient_funds" || msg.includes("insufficient funds")) {
    return { code, reason: "Card has insufficient funds. Please use a different card." };
  }
  if (code === "incorrect_cvc" || msg.includes("cvc")) {
    return { code, reason: "Card CVC is incorrect." };
  }
  if (code === "expired_card" || msg.includes("expired")) {
    return { code, reason: "This card has expired." };
  }
  return { code, reason: err?.message || err?.raw?.message || "Card payment failed." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expectedSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!expectedSecret || req.headers.get("x-internal-secret") !== expectedSecret) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { transfer_id, card_token, amount_cents, currency } = await req.json();
    if (!transfer_id || !card_token || !amount_cents) {
      return new Response(JSON.stringify({ success: false, error: "transfer_id, card_token, amount_cents required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const charge = await stripe.charges.create({
        amount: Math.round(Number(amount_cents)),
        currency: (currency || "cad").toLowerCase(),
        source: card_token,
        description: `eFinMoney transfer ${transfer_id}`,
        metadata: { transfer_id: String(transfer_id) },
      });

      if (charge.status !== "succeeded") {
        return new Response(JSON.stringify({
          success: false,
          error: `Card charge ${charge.status}`,
          code: "charge_not_succeeded",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await supabase.from("transfers").update({
        provider_charge_id: charge.id,
      }).eq("id", transfer_id);

      return new Response(JSON.stringify({
        success: true,
        charge_id: charge.id,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err: any) {
      console.error("stripe charge error:", err?.message, err?.raw || err);
      const { reason, code } = friendlyChargeError(err);
      return new Response(JSON.stringify({ success: false, error: reason, code }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("stripe-charge-card fatal", err);
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
