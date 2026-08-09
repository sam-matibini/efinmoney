import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchNombaBankCodes, isNombaNigeriaConfigured } from "../_shared/nomba-nigeria.ts";
import { NG_BANKS_FALLBACK } from "../_shared/ng-banks-fallback.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cached } = await admin
      .from("nomba_banks_cache")
      .select("banks, fetched_at")
      .eq("country", "NG")
      .maybeSingle();

    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < 24 * 3600 * 1000) {
      return new Response(JSON.stringify({ banks: cached.banks, cached: true, source: "nomba" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isNombaNigeriaConfigured()) {
      return new Response(JSON.stringify({
        banks: cached?.banks ?? NG_BANKS_FALLBACK,
        cached: Boolean(cached?.banks),
        fallback: "static",
        source: "static",
        error: "Nomba Nigeria not configured (NOMBA_PAY_API_URL / NOMBA_PAY_USER)",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { banks, result } = await fetchNombaBankCodes();
    if (banks.length > 0) {
      const normalized = banks.map((b) => ({ code: b.code, name: b.name, nipCode: b.nipCode, logo: b.logo }));
      await admin.from("nomba_banks_cache").upsert({
        country: "NG",
        banks: normalized,
        fetched_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ banks: normalized, cached: false, source: "nomba" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (cached?.banks) {
      return new Response(JSON.stringify({
        banks: cached.banks,
        cached: true,
        stale: true,
        source: "nomba",
        error: result.message,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Nomba upstream (lenhub) currently 404s on the bankcode path, so never fail
    // the request: serve the static NG bank list instead of blanking the UI.
    return new Response(JSON.stringify({
      banks: NG_BANKS_FALLBACK,
      cached: false,
      fallback: "static",
      source: "static",
      error: result.message || "Nomba bank list unavailable",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Flutterwave/static fallbacks disabled while debugging Nomba:
    // return fallbackFlw(req, admin, cached, result.message);
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/* Flutterwave/static fallbacks disabled while debugging Nomba-only mode.
async function fallbackFlw(...) { ... }
*/
