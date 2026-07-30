import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchNombaExchangeRate, isNombaNigeriaConfigured } from "../_shared/nomba-nigeria.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const pair = url.searchParams.get("pair");
    let from = url.searchParams.get("from") || url.searchParams.get("from_dat") || "USD";
    let to = url.searchParams.get("to") || "NGN";
    if (pair && pair.includes("/")) {
      const [f, t] = pair.split("/");
      from = f || from;
      to = t || to;
    }
    from = from.toUpperCase();
    to = to.toUpperCase();

    let nombaRates: Awaited<ReturnType<typeof fetchNombaExchangeRate>>["rates"] = [];
    let nombaError: string | null = null;
    if (isNombaNigeriaConfigured() && (from === "NGN" || to === "NGN")) {
      const { rates, result } = await fetchNombaExchangeRate(from, to);
      nombaRates = rates;
      if (!result.ok) nombaError = result.message;
    }

    const primary = nombaRates[0];
    if (primary?.midRateNumeric) {
      return new Response(JSON.stringify({
        from,
        to,
        pair: primary.pair || `${from}/${to}`,
        bid_rate: primary.bidRate,
        ask_rate: primary.askRate,
        mid_rate: primary.midRate,
        effective_rate: primary.midRateNumeric,
        source: "nomba",
        rates: nombaRates,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fallback to internally stored FX rates (Nomba only quotes a subset of pairs)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: fxRow } = await admin
      .from("fx_rates")
      .select("effective_rate, rate, source, valid_from")
      .eq("from_currency", from)
      .eq("to_currency", to)
      .order("valid_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    const fallbackRate = Number(fxRow?.effective_rate ?? fxRow?.rate ?? 0);
    if (fallbackRate > 0) {
      return new Response(JSON.stringify({
        from,
        to,
        pair: `${from}/${to}`,
        bid_rate: String(fallbackRate),
        ask_rate: String(fallbackRate),
        mid_rate: String(fallbackRate),
        effective_rate: fallbackRate,
        source: fxRow?.source || "fx_rates",
        nomba_error: nombaError,
        rates: nombaRates,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      error: nombaError || "Rate unavailable",
      from,
      to,
      source: "nomba",
    }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
