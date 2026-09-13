import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadCorridorFxBenchmark } from "../_shared/loadCorridorFxBenchmark.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await anon.auth.getUser();
  if (!auth?.user) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const from = String(body.from ?? url.searchParams.get("from") ?? "").toUpperCase();
  const to = String(body.to ?? url.searchParams.get("to") ?? "").toUpperCase();
  const preferredPartner = body.preferred_partner ?? url.searchParams.get("preferred_partner");

  if (!from || !to) return json({ error: "from and to are required" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const result = await loadCorridorFxBenchmark(admin, { from, to, preferredPartner });
    return json({
      from,
      to,
      benchmark_rate: result.rate,
      source: result.source,
      partner_code: result.partnerCode,
      treasury_mid: result.treasuryMid,
      quotes: result.quotes,
      rule: "Customer FX = corridor provider FX × (1 − eFinMoney internal margin)",
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Quote failed" }, 500);
  }
});
