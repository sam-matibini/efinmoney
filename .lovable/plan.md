# Real FX & crypto rates in the rolling banner

## What's wrong today
- Fiat pairs use a small hard-coded `FALLBACK_RATES` table if `useFxRates()` is missing a pair.
- Crypto pairs are entirely hard-coded (`BTC 71240.50` etc.).
- The "% delta" is a deterministic `sin()` of the price — fake, not a real 24h change.
- Flag emojis show as plain text on Windows (the user's screenshot shows "USCA", "USNG", "USKE"… — that's the regional-indicator letter pair rendering as ASCII).

## What I'll build

### 1. New public edge function `market-rates`
`supabase/functions/market-rates/index.ts` (`verify_jwt = false`, anon-readable, 60s in-memory cache, CORS on).

Returns:
```json
{
  "fiat":   [{ "from":"USD", "to":"CAD", "price":1.3712, "change24h":0.12 }, ...],
  "crypto": [{ "symbol":"BTC", "price":71240.5, "change24h":2.41 }, ...],
  "fetched_at": "..."
}
```

**Fiat source** — read from existing `fx_rates` table for the 8 pairs the ticker uses (USD→CAD/NGN/KES/GHS/ZMW, CAD→NGN, GBP→USD, EUR→USD). For the 24h change, pull the most-recent row plus the row closest to 24h ago for the same pair and compute `(latest − prior) / prior * 100`. If no 24h-old row exists, return `change24h: 0`. No new ingestion — `refresh-fx-rates` already populates this table from OpenExchangeRates.

**Crypto source** — single CoinGecko call:
```
https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,stellar,usd-coin&vs_currencies=usd&include_24hr_change=true
```
Public, keyless, rate-limited (~30 req/min) — the 60s server cache makes that a non-issue. If the call fails, the function returns `crypto: []` and the client just hides those rows; no fake numbers.

### 2. Update `src/components/landing/MarketTicker.tsx`
- Drop `useFxRates` import, `FALLBACK_RATES`, hard-coded `CRYPTO` array, and `deterministicDelta`.
- Add `useQuery(['market-rates'], () => supabase.functions.invoke('market-rates'))` with `refetchInterval: 60_000`.
- Build the ticker items from the response. While loading or on error, render an "Updating live markets…" skeleton row so the marquee never disappears.
- Keep the same visual structure (label · price · delta with arrow · pause-on-hover marquee).

### 3. Fix the flag rendering bug (small, related)
Replace emoji flags with `<img>` from `https://flagcdn.com/20x15/{cc}.png` (a free CDN that ships real PNG flags). One `<img>` per country (or two side-by-side for fiat pairs), `width={20} height={15}`, `loading="lazy"`, rounded-sm. Crypto rows keep their unicode coin glyph (₿ Ξ ◎ ✕ ★ ⓤ) since those render reliably across platforms.

### 4. Config
- Append `[functions.market-rates] verify_jwt = false` to `supabase/config.toml`.

## Out of scope
- No DB schema changes, no new ingestion jobs, no changes to `refresh-fx-rates`.
- No new copy, no color/layout changes elsewhere on the landing page.
- No paid CoinGecko Pro key — the free public endpoint is fine behind the 60s server cache.

## Files touched
- `supabase/functions/market-rates/index.ts` (new)
- `supabase/config.toml` (edit — add function entry)
- `src/components/landing/MarketTicker.tsx` (edit — switch to real data + flag PNGs)
