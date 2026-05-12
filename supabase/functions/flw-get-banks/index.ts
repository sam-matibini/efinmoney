// V4 banks list — GET /banks?country=NG
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

    const country = (new URL(req.url).searchParams.get("country") || "NG").toUpperCase();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: cached } = await admin.from("flw_banks_cache").select("banks, fetched_at").eq("country", country).maybeSingle();
    if (cached && (Date.now() - new Date(cached.fetched_at).getTime() < 24 * 3600 * 1000)) {
      return new Response(JSON.stringify({ banks: cached.banks, cached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Try V4 first with a short timeout
    let banks: any = null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const { ok, json } = await flwFetch(`/banks?country=${country}`, { method: "GET", signal: ctrl.signal });
      clearTimeout(t);
      if (ok && isFlwSuccess(json)) banks = json.data;
    } catch (e) { console.warn("V4 banks failed", e); }

    // Fallback: V3 banks endpoint (legacy, uses FLW_SECRET_KEY)
    if (!banks) {
      try {
        const secret = Deno.env.get("FLW_SECRET_KEY");
        if (secret) {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const r = await fetch(`https://api.flutterwave.com/v3/banks/${country}`, {
            headers: { Authorization: `Bearer ${secret}` },
            signal: ctrl.signal,
          });
          clearTimeout(t);
          const j = await r.json().catch(() => ({}));
          if (r.ok && j?.status === "success" && Array.isArray(j.data)) banks = j.data;
          else console.warn("V3 banks failed", r.status, j);
        }
      } catch (e) { console.warn("V3 banks fetch error", e); }
    }

    // Last resort: serve stale cache if present
    if (!banks && cached?.banks) {
      return new Response(JSON.stringify({ banks: cached.banks, cached: true, stale: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!banks) {
      return new Response(JSON.stringify({ error: "Bank service is temporarily unavailable. Please try again shortly." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await admin.from("flw_banks_cache").upsert({ country, banks, fetched_at: new Date().toISOString() });
    return new Response(JSON.stringify({ banks, cached: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
