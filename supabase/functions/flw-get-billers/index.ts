// V3 bill categories — GET /v3/top-bill-categories  (or /v3/bill-categories)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";

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

    let billers: any[] = [];
    const { ok, json } = await flwV3Fetch(`/top-bill-categories`, { method: "GET", timeoutMs: 10_000 });
    if (ok && Array.isArray(json?.data)) {
      billers = json.data.filter((b: any) => !country || (b.country || "").toUpperCase() === country || !b.country);
    }

    if (billers.length === 0 && cached?.billers) {
      return new Response(JSON.stringify({ billers: cached.billers, cached: true, stale: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (category) {
      const cat = category.toLowerCase();
      billers = billers.filter((b: any) => (b.biller_name || b.label_name || b.name || "").toLowerCase().includes(cat));
    }
    await admin.from("flw_billers_cache").upsert({ country, category, billers, fetched_at: new Date().toISOString() }, { onConflict: "country,category" });
    return new Response(JSON.stringify({ billers, cached: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
