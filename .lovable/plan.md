Make the bid/ask quotes in the MarketTicker marquee more visually prominent.

## Problem
Bid/ask chips are present in every ticker item but visually blend in because they share the same text size and weight as surrounding metadata (inverse rate, separator dot).

## Changes (single file: `src/components/landing/MarketTicker.tsx`)

1. **Increase bid/ask chip weight and size**
   - Bump from `text-xs` to `text-sm`.
   - Use `font-bold` on the "Bid" / "Ask" labels.
   - Give the numeric values `text-white/90` so they stand out against the mid price.

2. **Add subtle background pill**
   - Wrap the Bid/Ask group in a `rounded-full bg-white/5 px-2 py-0.5` container so it reads as one distinct unit.

3. **Add a "Bid / Ask" header chip at the start of the marquee**
   - Insert a small non-scrolling static chip immediately after the "Live markets · Indicative" badge.
   - Chip text: "Bid / Ask" with `text-[10px] uppercase tracking-wider` and a light border.
   - This acts as a visual anchor so users know what the two numbers represent without reading every label.

4. **No functional changes**
   - Same spread math, same `decimalsFor`, same data source.
   - No new API calls, no edge-function edits.

## Technical detail
- Tailwind classes only; no new dependencies.
- The marquee row stays a single duplicated flex row; the header chip is absolutely positioned beside the live dot.