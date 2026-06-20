import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPPORTED = ["USD", "CAD", "EUR", "GBP", "NGN", "KES", "UGX", "TZS", "ZMW", "BIF", "MZN", "GHS", "RWF", "XAF", "XOF", "MWK", "ZAR", "BWP"];
const MARKUP = 0.005; // 0.5% spread

// Try OpenExchangeRates (paid, accurate). On any failure fall back to
// open.er-api.com (free, no key, covers every currency we list).
async function fetchUsdRates(): Promise<{ source: string; rates: Record<string, number> }> {
  const appId = Deno.env.get("OPENEXCHANGERATES_APP_ID");
  if (appId) {
    try {
      const symbols = SUPPORTED.filter((c) => c !== "USD").join(",");
      const url = `https://openexchangerates.org/api/latest.json?app_id=${appId}&base=USD&symbols=${symbols}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return { source: "openexchangerates", rates: { USD: 1, ...(data.rates || {}) } };
      }
      console.warn("OpenExchangeRates failed:", res.status, await res.text());
    } catch (e) {
      console.warn("OpenExchangeRates threw:", e);
    }
  }

  // Fallback: free, no key, base=USD
  const fbRes = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!fbRes.ok) {
    throw new Error(`Fallback FX provider failed [${fbRes.status}]: ${await fbRes.text()}`);
  }
  const fbData = await fbRes.json();
  if (!fbData?.rates) throw new Error("Fallback FX provider returned no rates");
  return { source: "open.er-api.com", rates: { USD: 1, ...fbData.rates } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { source, rates } = await fetchUsdRates();

    const now = new Date();
    const validUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    const rows: any[] = [];

    for (const from of SUPPORTED) {
      for (const to of SUPPORTED) {
        if (from === to) continue;
        const fromRate = rates[from];
        const toRate = rates[to];
        if (!fromRate || !toRate) continue;
        // cross rate via USD
        const market = toRate / fromRate;
        const effective = market * (1 - MARKUP);
        rows.push({
          from_currency: from,
          to_currency: to,
          rate: market,
          markup_rate: MARKUP,
          effective_rate: effective,
          source,
          valid_from: now.toISOString(),
          valid_until: validUntil,
        });
      }
    }

    const { error } = await supabase.from("fx_rates").insert(rows);
    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, source, inserted: rows.length, fetched_at: now.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("refresh-fx-rates error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
