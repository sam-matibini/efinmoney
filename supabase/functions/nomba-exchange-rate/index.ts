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

    if (nombaError || !isNombaNigeriaConfigured()) {
      return new Response(JSON.stringify({
        error: nombaError || "Nomba Nigeria not configured",
        from,
        to,
        source: "nomba",
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Internal fx_rates fallback disabled while debugging Nomba NGN quotes:
    // const { data: fxRow } = await admin.from("fx_rates")...

    return new Response(JSON.stringify({ error: "Nomba rate unavailable", from, to, source: "nomba" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
