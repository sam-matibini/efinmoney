import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const pubKey = Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "";
    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const keyPrefix = secretKey.startsWith("sk_live_")
      ? "sk_live"
      : secretKey.startsWith("sk_test_")
      ? "sk_test"
      : "unknown";

    const res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const account = await res.json();

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: account?.error?.message ?? "Stripe API error",
          keyPrefix,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const mode: "live" | "test" =
      keyPrefix === "sk_live" ? "live" : "test";

    const mask = (k: string) =>
      k.length > 14 ? `${k.slice(0, 10)}…${k.slice(-4)}` : k;

    return new Response(
      JSON.stringify({
        mode,
        keyPrefix,
        publishableKeyMasked: pubKey ? mask(pubKey) : null,
        publishableKeyPrefix: pubKey.startsWith("pk_live_")
          ? "pk_live"
          : pubKey.startsWith("pk_test_")
          ? "pk_test"
          : "unknown",
        accountId: account.id,
        country: account.country,
        defaultCurrency: account.default_currency,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        businessType: account.business_type,
        email: account.email,
        capabilities: account.capabilities ?? {},
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
