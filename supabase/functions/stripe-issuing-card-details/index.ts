import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Returns an ephemeral key + Stripe card id so the browser can use
// Stripe Issuing Elements to display PAN/CVV without us ever touching them.
Deno.serve(async (req) => {
  const { isStripeEnabled, stripeDisabledResponse } = await import("../_shared/stripe-guard.ts");
  if (!isStripeEnabled()) return stripeDisabledResponse();

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimData, error: claimErr } = await supabase.auth.getClaims(token);
    if (claimErr || !claimData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimData.claims.sub as string;

    const { card_id, nonce } = await req.json();
    if (!card_id) return json({ error: "card_id required" }, 400);

    const { data: card } = await admin.from("issued_cards").select("*").eq("id", card_id).maybeSingle();
    if (!card || card.user_id !== userId) return json({ error: "Card not found" }, 404);

    if (!card.stripe_card_id) {
      // Sandbox card — return masked placeholder so the UI degrades gracefully
      return json({
        sandbox: true,
        last4: card.last4,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        message: "Stripe Issuing not enabled. Card is sandbox-only.",
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as any });

    const ek = await stripe.ephemeralKeys.create(
      { issuing_card: card.stripe_card_id, nonce },
      { apiVersion: "2020-03-02" }
    );

    return json({ ephemeralKeySecret: ek.secret, issuingCardId: card.stripe_card_id });
  } catch (e: any) {
    console.error("card-details error:", e);
    return json({ error: e?.message || "Failed" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
