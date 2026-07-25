import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Non-USD pairs we surface directly (for a real 24h-change series and, for
// CAD→NGN, the live Nomba corridor rate). Every other cross-rate is derived
// client-side by buildUsdMap from the USD→X rows returned below.
const EXPLICIT_PAIRS: { from: string; to: string }[] = [
  { from: "CAD", to: "NGN" },
  { from: "CAD", to: "BWP" },
  { from: "GBP", to: "USD" },
  { from: "EUR", to: "USD" },
];

const CRYPTO_IDS = [
  { id: "bitcoin", symbol: "BTC" },
  { id: "ethereum", symbol: "ETH" },
  { id: "solana", symbol: "SOL" },
  { id: "ripple", symbol: "XRP" },
  { id: "stellar", symbol: "XLM" },
  { id: "usd-coin", symbol: "USDC" },
];

// 60s in-memory cache (per-isolate)
let cache: { at: number; body: unknown } | null = null;
const CACHE_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return new Response(JSON.stringify(cache.body), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // FIAT: return every currently-valid USD→X rate (one row per currency) so
    // the client can quote any pickable currency, plus a few explicit non-USD
    // pairs. Two bulk queries drive the whole USD→X set instead of one query
    // per pair, which scales to the full currency list.
    const fiat: { from: string; to: string; price: number; market_price: number; change24h: number }[] = [];
    const nowIso = new Date().toISOString();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Latest valid USD→X (dedupe to newest per to_currency).
    const { data: latestUsd } = await supabase
      .from("fx_rates")
      .select("to_currency, rate, effective_rate, valid_from")
      .eq("from_currency", "USD")
      .gt("valid_until", nowIso)
      .order("valid_from", { ascending: false })
      .limit(5000);
    // ~24h-ago USD→X for a change series (dedupe to newest before the cutoff).
    const { data: priorUsd } = await supabase
      .from("fx_rates")
      .select("to_currency, effective_rate, valid_from")
      .eq("from_currency", "USD")
      .lte("valid_from", oneDayAgo)
      .order("valid_from", { ascending: false })
      .limit(5000);

    const priorByTo = new Map<string, number>();
    for (const r of priorUsd ?? []) {
      if (!priorByTo.has(r.to_currency)) priorByTo.set(r.to_currency, Number(r.effective_rate));
    }
    const seenUsd = new Set<string>();
    for (const r of latestUsd ?? []) {
      if (seenUsd.has(r.to_currency)) continue;
      seenUsd.add(r.to_currency);
      const price = Number(r.effective_rate);
      if (!price || price <= 0) continue;
      const market_price = Number(r.rate) || price;
      const prior = priorByTo.get(r.to_currency);
      const change24h = prior && prior > 0 ? ((price - prior) / prior) * 100 : 0;
      fiat.push({ from: "USD", to: r.to_currency, price, market_price, change24h });
    }

    // Explicit non-USD pairs — most-recent + closest-to-24h-old row per pair.
    await Promise.all(
      EXPLICIT_PAIRS.map(async (p) => {
        const { data: latestArr } = await supabase
          .from("fx_rates")
          .select("rate, effective_rate, valid_from")
          .eq("from_currency", p.from)
          .eq("to_currency", p.to)
          .order("valid_from", { ascending: false })
          .limit(1);
        const latest = latestArr?.[0];
        if (!latest) return;

        const { data: priorArr } = await supabase
          .from("fx_rates")
          .select("effective_rate, valid_from")
          .eq("from_currency", p.from)
          .eq("to_currency", p.to)
          .lte("valid_from", oneDayAgo)
          .order("valid_from", { ascending: false })
          .limit(1);
        const prior = priorArr?.[0];
        const price = Number(latest.effective_rate);
        const market_price = Number(latest.rate) || price;
        const change24h = prior && Number(prior.effective_rate) > 0
          ? ((price - Number(prior.effective_rate)) / Number(prior.effective_rate)) * 100
          : 0;
        fiat.push({ from: p.from, to: p.to, price, market_price, change24h });
      }),
    );

    // CRYPTO: CoinGecko public endpoint
    let crypto: { symbol: string; price: number; change24h: number }[] = [];
    try {
      const ids = CRYPTO_IDS.map((c) => c.id).join(",");
      const r = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
        { headers: { accept: "application/json" } },
      );
      if (r.ok) {
        const json = await r.json() as Record<string, { usd: number; usd_24h_change?: number }>;
        crypto = CRYPTO_IDS.flatMap((c) => {
          const row = json[c.id];
          if (!row) return [];
          return [{ symbol: c.symbol, price: Number(row.usd), change24h: Number(row.usd_24h_change ?? 0) }];
        });
      } else {
        console.warn("coingecko status", r.status);
      }
    } catch (e) {
      console.warn("coingecko fetch failed", e);
    }

    const body = { fiat, crypto, fetched_at: new Date().toISOString() };
    cache = { at: Date.now(), body };

    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("market-rates error:", msg);
    return new Response(JSON.stringify({ error: msg, fiat: [], crypto: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
