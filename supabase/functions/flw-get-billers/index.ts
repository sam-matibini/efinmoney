// V4 bill categories — GET /bill-categories?country=NG
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwFetch, isFlwSuccess } from "../_shared/flw-v4.ts";

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
    try {
      const { ok, json } = await flwFetch(`/bill-categories?country=${country}`, { method: "GET", timeoutMs: 6000 });
      if (ok && isFlwSuccess(json)) {
        billers = json.data || [];
      } else {
        console.warn("FLW bill-categories non-ok", json);
      }
    } catch (e) {
      console.warn("FLW bill-categories threw", e);
    }

    // Serve stale cache if available when upstream failed
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
