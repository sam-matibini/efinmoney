// V3 banks list — GET /v3/banks/{country}
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";
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
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const country = (new URL(req.url).searchParams.get("country") || "NG").toUpperCase();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: cached } = await admin.from("flw_banks_cache").select("banks, fetched_at").eq("country", country).maybeSingle();
    if (cached && (Date.now() - new Date(cached.fetched_at).getTime() < 24 * 3600 * 1000)) {
      return new Response(JSON.stringify({ banks: cached.banks, cached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let banks: any = null;
    const { ok, json } = await flwV3Fetch(`/banks/${country}`, { method: "GET", timeoutMs: 10_000 });
    if (ok && Array.isArray(json?.data)) banks = json.data;

    if (!banks && cached?.banks) {
      return new Response(JSON.stringify({ banks: cached.banks, cached: true, stale: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!banks) {
      if (country === "NG") {
        return new Response(JSON.stringify({ banks: NG_BANKS_FALLBACK, cached: false, fallback: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Bank service is temporarily unavailable. Please try again shortly." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await admin.from("flw_banks_cache").upsert({ country, banks, fetched_at: new Date().toISOString() });
    return new Response(JSON.stringify({ banks, cached: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
