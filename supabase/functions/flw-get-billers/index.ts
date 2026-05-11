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

    const url = new URL(req.url);
    const country = (url.searchParams.get("country") || "NG").toUpperCase();
    const category = url.searchParams.get("category") || null;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let cQ = admin.from("flw_billers_cache").select("billers, fetched_at").eq("country", country);
    cQ = category ? cQ.eq("category", category) : cQ.is("category", null);
    const { data: cached } = await cQ.maybeSingle();
    if (cached && (Date.now() - new Date(cached.fetched_at).getTime() < 24 * 3600 * 1000)) {
      return new Response(JSON.stringify({ billers: cached.billers, cached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const FLW_KEY = Deno.env.get("FLW_SECRET_KEY");
    if (!FLW_KEY) return new Response(JSON.stringify({ error: "Flutterwave not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const params = new URLSearchParams({ country });
    const res = await fetch(`https://api.flutterwave.com/v3/bill-categories?${params.toString()}`, { headers: { Authorization: `Bearer ${FLW_KEY}` } });
    const json = await res.json();
    if (!res.ok || json?.status !== "success") {
      return new Response(JSON.stringify({ error: json?.message || "Failed to fetch billers" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let billers = json.data || [];
    if (category) {
      const cat = category.toLowerCase();
      billers = billers.filter((b: { biller_name?: string; label_name?: string }) => (b.biller_name || b.label_name || "").toLowerCase().includes(cat));
    }
    await admin.from("flw_billers_cache").upsert({ country, category, billers, fetched_at: new Date().toISOString() }, { onConflict: "country,category" });
    return new Response(JSON.stringify({ billers, cached: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
