## Goal
Show the inverse (reciprocal) spot rate next to the existing price and 24h % change on the live markets ticker.

## Change
Single file: `src/components/landing/MarketTicker.tsx`

For each item, render an additional inverse-rate chip immediately before the % delta:

- Fiat: `USD/NGN 1,650.20  ·  NGN/USD 0.000606  ·  +0.42%`
- Crypto: `BTC/USD 71,240.50  ·  USD/BTC 0.00001404  ·  +1.23%`

Implementation details:
- Add an `inverse = 1 / price` computation per item.
- Helper `decimalsForInverse(inv)` to pick sensible precision (small numbers need 6–8 dp).
- Render the inverse with a subtler style: smaller text, lower opacity, and an arrow/swap glyph (`⇌`) before the inverse pair label so it reads as a derived rate, not a separate quote.
- No changes to the edge function — inverse is derived client-side from the same mid price already returned by `market-rates`.
- No changes to layout/marquee/flags; only the per-item inner row gets one extra span group.

## Out of scope
- No bid/ask spread (we don't have that data source).
- No new pairs, no new API calls, no copy changes elsewhere.
