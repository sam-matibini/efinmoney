import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const FIAT_PAIRS: { from: string; to: string }[] = [
  { from: "USD", to: "CAD" },
  { from: "USD", to: "NGN" },
  { from: "USD", to: "KES" },
  { from: "USD", to: "GHS" },
  { from: "USD", to: "ZMW" },
  { from: "CAD", to: "NGN" },
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

    // FIAT: most-recent + closest-to-24h-old row per pair
    const fiat: { from: string; to: string; price: number; change24h: number }[] = [];
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await Promise.all(
      FIAT_PAIRS.map(async (p) => {
        const { data: latestArr } = await supabase
          .from("fx_rates")
          .select("effective_rate, valid_from")
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
        const change24h = prior && Number(prior.effective_rate) > 0
          ? ((price - Number(prior.effective_rate)) / Number(prior.effective_rate)) * 100
          : 0;
        fiat.push({ from: p.from, to: p.to, price, change24h });
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
