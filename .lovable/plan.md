# Plan: Bid/Ask Quotes on the Rolling Banner

## Why this approach
The free FX/crypto feeds we already use (CoinGecko + OpenExchangeRates) only publish a **mid-market price** — neither exposes raw bid/ask on the free tier. A true bid/ask stream would require a paid market-data provider (OANDA, TraderMade, Polygon, Kraken L1, etc.).

To deliver this without a new paid integration, we'll derive bid/ask from the live mid using a small, transparent spread — the same way most consumer FX apps display indicative quotes. Each row will be clearly labeled "Bid / Ask" so it isn't confused with an institutional quote.

## What the ticker will show
Each item gets one extra chip placed **before** the 24h % delta:

```
🇺🇸→🇳🇬  USD/NGN  1,650.20  ⇌ NGN/USD 0.000606  ·  Bid 1,648.55 / Ask 1,651.85  ·  +0.42%
₿  BTC/USD  71,240.50  ⇌ USD/BTC 0.00001404  ·  Bid 71,098.02 / Ask 71,383.00  ·  +1.23%
```

- `bid = mid × (1 − spread/2)`
- `ask = mid × (1 + spread/2)`
- Default spreads (tunable in one constant):
  - Major fiat (USD, EUR, GBP, CAD, AUD, JPY, CHF): **10 bps** (0.10%)
  - Emerging-market fiat (NGN, KES, GHS, ZAR, INR, BRL, MXN, etc.): **40 bps** (0.40%)
  - Crypto: **30 bps** (0.30%)
- Same decimal-precision helper already used for the mid is reused for bid/ask.

## Files touched
- `src/components/landing/MarketTicker.tsx` — only file. Add:
  - `SPREAD_BPS` map + `getSpreadBps(item)` helper
  - `bid`/`ask` computed per item
  - One extra span group rendered before the % delta, styled to match the existing inverse chip (smaller text, muted color, separator dot)

## Out of scope
- No new edge function or API call — bid/ask are derived client-side from the existing `market-rates` mid price.
- No real bid/ask provider (can be added later as a follow-up; would replace the spread math with provider fields).
- No layout/marquee/flag changes.

## Honest caveat to surface in copy
A tiny "indicative" tag next to the first ticker label (e.g. "Indicative quotes · updated every 60s") so we never imply these are executable institutional quotes.