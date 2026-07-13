import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.3.1?target=denonext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-11-20.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { isStripeEnabled, stripeDisabledResponse } = await import("../_shared/stripe-guard.ts");
  if (!isStripeEnabled()) return stripeDisabledResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized", hint: "Sign in and try again" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) return json({ error: "Unauthorized", hint: "Sign in and try again" }, 401);
    const userId = userData.user.id;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load profile
    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, email, full_name, stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id as string | null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? userData.user.email ?? undefined,
        name: profile?.full_name ?? undefined,
        metadata: { user_id: userId },
      });
      customerId = customer.id;
      await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("user_id", userId);
    }

    const setup = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { user_id: userId },
    });

    return json({
      clientSecret: setup.client_secret,
      customerId,
      publishableKey: Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "",
    });
  } catch (e) {
    console.error("stripe-save-card error:", e);
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});
