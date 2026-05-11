import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const country = (new URL(req.url).searchParams.get("country") || "NG").toUpperCase();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: cached } = await admin.from("flw_banks_cache").select("banks, fetched_at").eq("country", country).maybeSingle();
    if (cached && (Date.now() - new Date(cached.fetched_at).getTime() < 24 * 3600 * 1000)) {
      return new Response(JSON.stringify({ banks: cached.banks, cached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const FLW_KEY = Deno.env.get("FLW_SECRET_KEY");
    if (!FLW_KEY) return new Response(JSON.stringify({ error: "Flutterwave not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const res = await fetch(`https://api.flutterwave.com/v3/banks/${country}`, { headers: { Authorization: `Bearer ${FLW_KEY}` } });
    const json = await res.json();
    if (!res.ok || json?.status !== "success") {
      return new Response(JSON.stringify({ error: json?.message || "Failed to fetch banks" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    await admin.from("flw_banks_cache").upsert({ country, banks: json.data, fetched_at: new Date().toISOString() });
    return new Response(JSON.stringify({ banks: json.data, cached: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
