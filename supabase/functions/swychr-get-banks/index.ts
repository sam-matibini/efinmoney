import { corsHeaders } from "../_shared/cors.ts";
import { isSwychrConfigured, isSwychrEnabled } from "../_shared/swychr-auth.ts";
import { getSwychrNigeriaBanks } from "../_shared/swychr-payout.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!isSwychrEnabled() || !isSwychrConfigured("payout")) {
    return new Response(JSON.stringify({ error: "Swychr disabled" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const banks = await getSwychrNigeriaBanks();
    return new Response(JSON.stringify({ banks, source: "swychr" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
