import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPPORTED = ["USD", "CAD", "EUR", "GBP", "NGN", "KES", "UGX", "TZS", "ZMW", "BIF", "MZN", "GHS", "RWF", "XAF", "XOF", "MWK", "ZAR"];
const MARKUP = 0.005; // 0.5% spread

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const appId = Deno.env.get("OPENEXCHANGERATES_APP_ID");
    if (!appId) throw new Error("OPENEXCHANGERATES_APP_ID is not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const symbols = SUPPORTED.filter((c) => c !== "USD").join(",");
    const url = `https://openexchangerates.org/api/latest.json?app_id=${appId}&base=USD&symbols=${symbols}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenExchangeRates error [${res.status}]: ${body}`);
    }
    const data = await res.json();
    const rates: Record<string, number> = { USD: 1, ...data.rates };

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
          source: "openexchangerates",
          valid_from: now.toISOString(),
          valid_until: validUntil,
        });
      }
    }

    // Insert fresh rows (fx_rates is a time-series table; valid_from differs each run)
    const { error } = await supabase.from("fx_rates").insert(rows);
    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, inserted: rows.length, fetched_at: now.toISOString() }),
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
