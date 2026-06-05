import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: row } = await supabase
      .from("stripe_connected_accounts")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!row) return json({ error: "No connected account found. Create one first." }, 404);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "Stripe not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const component: string = body.component || "account_onboarding";

    // Components allowed for embedded onboarding
    const components: Record<string, any> = {
      [component]: { enabled: true },
    };

    const params = new URLSearchParams();
    params.append("account", row.stripe_account_id);
    for (const [k, v] of Object.entries(components)) {
      params.append(`components[${k}][enabled]`, String(v.enabled));
    }

    const r = await fetch("https://api.stripe.com/v1/account_sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const session = await r.json();
    if (!r.ok) {
      console.error("account_sessions failed", session);
      return json({ error: session?.error?.message || "account_sessions failed" }, r.status);
    }

    return json({
      client_secret: session.client_secret,
      publishable_key: Deno.env.get("STRIPE_PUBLISHABLE_KEY"),
      account_id: row.stripe_account_id,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
