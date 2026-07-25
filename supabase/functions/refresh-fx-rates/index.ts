import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchNombaExchangeRate, isNombaNigeriaConfigured } from "../_shared/nomba-nigeria.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// CORE currencies get the full NxN cross-product so server-side lookups
// (fx_convert, transfer limits) always find a direct row for a transacting
// corridor. Everything the provider AND the currencies table both know about
// additionally gets a USD->X row so the Live FX Calculator can derive any
// cross-rate client-side (buildUsdMap). Keeping CORE small bounds table growth;
// the broad USD->X set is one row per currency.
const CORE = ["USD", "CAD", "EUR", "GBP", "NGN", "KES", "UGX", "TZS", "ZMW", "BIF", "MZN", "GHS", "RWF", "XAF", "XOF", "MWK", "ZAR", "BWP"];
const MARKUP = 0.005; // 0.5% spread

// Try OpenExchangeRates (paid, accurate). On any failure fall back to
// open.er-api.com (free, no key, covers every currency we list).
async function fetchUsdRates(): Promise<{ source: string; rates: Record<string, number> }> {
  const appId = Deno.env.get("OPENEXCHANGERATES_APP_ID");
  if (appId) {
    try {
      // No symbols filter: pull every currency the provider offers so the broad
      // USD->X coverage below is as wide as the currencies table allows.
      const url = `https://openexchangerates.org/api/latest.json?app_id=${appId}&base=USD`;
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

    // CORE NxN: direct rows for every transacting corridor (server-side lookups).
    for (const from of CORE) {
      for (const to of CORE) {
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

    // BROAD USD->X: one row per currency the provider AND the currencies table
    // both know, so the calculator can quote any pickable currency via a
    // client-side cross-rate. fx_rates.{from,to}_currency FK -> currencies(code),
    // so restricting to existing codes keeps the whole batch insert FK-safe.
    const { data: ccyRows, error: ccyErr } = await supabase
      .from("currencies")
      .select("code")
      .eq("is_active", true);
    if (ccyErr) throw ccyErr;
    const tableCodes = new Set((ccyRows ?? []).map((r: { code: string }) => r.code));
    const coreSet = new Set(CORE);

    for (const [code, rateVal] of Object.entries(rates)) {
      if (code === "USD" || coreSet.has(code)) continue; // USD->core already emitted above
      if (!tableCodes.has(code)) continue; // FK: must exist in currencies
      const market = Number(rateVal);
      if (!market || market <= 0) continue;
      rows.push({
        from_currency: "USD",
        to_currency: code,
        rate: market,
        markup_rate: MARKUP,
        effective_rate: market * (1 - MARKUP),
        source,
        valid_from: now.toISOString(),
        valid_until: validUntil,
      });
    }

    if (isNombaNigeriaConfigured()) {
      for (const pair of [["USD", "NGN"], ["CAD", "NGN"], ["GBP", "NGN"], ["EUR", "NGN"]] as const) {
        const [from, to] = pair;
        const { rates: nombaRates } = await fetchNombaExchangeRate(from, to);
        const mid = nombaRates[0]?.midRateNumeric;
        if (!mid || mid <= 0) continue;
        rows.push({
          from_currency: from,
          to_currency: to,
          rate: mid,
          markup_rate: 0,
          effective_rate: mid,
          source: "nomba",
          valid_from: now.toISOString(),
          valid_until: validUntil,
        });
        rows.push({
          from_currency: to,
          to_currency: from,
          rate: 1 / mid,
          markup_rate: 0,
          effective_rate: 1 / mid,
          source: "nomba",
          valid_from: now.toISOString(),
          valid_until: validUntil,
        });
      }
    }

    // fx_rates is UNIQUE (from_currency, to_currency, valid_from) and every row
    // in a run shares valid_from, so the same pair must not appear twice. The
    // cross-rate loop already emits CAD->NGN etc., and the Nomba block re-emits
    // those pairs -- inserting both violates the constraint and fails the whole
    // batch. Deduplicate by pair, keeping the last writer: Nomba's live corridor
    // rate is more accurate than a USD cross-rate and is pushed after it.
    const byPair = new Map<string, any>();
    for (const row of rows) {
      byPair.set(`${row.from_currency}|${row.to_currency}`, row);
    }
    const deduped = Array.from(byPair.values());

    const { error } = await supabase.from("fx_rates").insert(deduped);
    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        source,
        inserted: deduped.length,
        deduplicated: rows.length - deduped.length,
        fetched_at: now.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("refresh-fx-rates error:", err);
    // Supabase returns PostgrestError as a plain object, not an Error, so
    // instanceof alone reports "Unknown error" and hides the real cause.
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? JSON.stringify(err)
          : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
