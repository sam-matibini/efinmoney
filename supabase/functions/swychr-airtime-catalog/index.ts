import { corsHeaders } from "../_shared/cors.ts";
import { isSwychrConfigured, isSwychrEnabled } from "../_shared/swychr-auth.ts";
import { listSwychrOperators, listSwychrProductsByCountry } from "../_shared/swychr-airtime.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!isSwychrEnabled() || !isSwychrConfigured("airtime")) {
    return new Response(JSON.stringify({ error: "Swychr airtime disabled" }), {
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

  const body = await req.json().catch(() => ({}));
  const country = String((body as Record<string, unknown>).country ?? "NG").toUpperCase();
  const type = String((body as Record<string, unknown>).type ?? "products");

  try {
    const data = type === "operators"
      ? await listSwychrOperators(country)
      : await listSwychrProductsByCountry(country);
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Catalog failed" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
