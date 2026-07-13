import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
    const token = authHeader.replace("Bearer ", "");
    const { data: claimData, error: claimErr } = await supabase.auth.getClaims(token);
    if (claimErr || !claimData?.claims) return json({ error: "Unauthorized" }, 401);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" as any });

    const bal = await stripe.balance.retrieve();
    // Issuing balance lives under `issuing.available` (array of {amount, currency})
    const issuing = (bal as any).issuing?.available ?? [];
    const byCurrency: Record<string, number> = {};
    for (const b of issuing) {
      byCurrency[(b.currency as string).toUpperCase()] = (b.amount as number) / 100;
    }
    return json({ available: byCurrency });
  } catch (e: any) {
    console.error("issuing-balance error:", e?.message);
    return json({ error: e?.message || "Failed" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
