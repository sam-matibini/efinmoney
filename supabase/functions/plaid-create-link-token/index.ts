import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAID_ENV = Deno.env.get("PLAID_ENV") || "sandbox";
const PLAID_BASE = `https://${PLAID_ENV}.plaid.com`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const res = await fetch(`${PLAID_BASE}/link/token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: Deno.env.get("PLAID_CLIENT_ID"),
        secret: Deno.env.get("PLAID_SECRET"),
        client_name: "eFinMoney",
        language: "en",
        country_codes: ["CA"],
        user: { client_user_id: user.id },
        products: ["auth"],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Plaid link/token/create error", data);
      return new Response(JSON.stringify({ error: data.error_message || "Plaid error", details: data }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ link_token: data.link_token, expiration: data.expiration }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
