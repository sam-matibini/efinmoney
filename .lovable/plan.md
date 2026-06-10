Rebuild the landing marquee so each pair shows one clear, honest piece of information instead of a wall of chips.

## What's wrong today

1. **Unreadable** — ticker background (`hsl(248_55%_8%)/95` + backdrop-blur) doesn't hold against the bright hero gradient, so white numbers wash out. Only the colored "Bid / Ask / -0.07%" labels survive.
2. **Cluttered** — every pair renders: flags · pair · mid · ⇌ inverse pair · inverse rate · Bid · bid value · / · Ask · ask value · 24h % · bullet. That's ~12 chips per item, all at small sizes.
3. **Dishonest** — bid/ask is just `mid × (1 ± spread/2)` with hardcoded basis-point spreads. It's not a real market quote. Removing it is the right call.
4. **Inverse rate** adds little for a marketing banner and is already shown on the Exchange page.

## New design — one row, one purpose per pair

Each item, left to right:

```
[flag flag]  CAD → NGN   1,178.42   ▲ +0.42%
```

- **Flags** (fiat) or **glyph** (crypto) — same as today.
- **Pair label** — bold, `text-white`, `text-sm`. Uses arrow `→` instead of slash so it reads as "from CAD to NGN".
- **Rate** — `tabular-nums`, `text-white/95`, `font-semibold`, `text-sm`. Smart decimals (existing `decimalsFor`).
- **24h delta** — kept, with up/down arrow. `text-emerald-400` / `text-rose-400`, `font-semibold`.
- Separator: a thin vertical divider `|` instead of a bullet, `text-white/15`.

Removed: inverse rate chip, bid/ask chip, "Indicative" caveat (no longer applies).

## Readability fixes

- Banner background: switch from `bg-[hsl(248_55%_8%)]/95 backdrop-blur-md` to **solid** `bg-[hsl(248_55%_6%)]` with a top + bottom hairline border. No blur. Guarantees contrast on any hero.
- Add a subtle inner gradient overlay (top 1px highlight) for polish.
- Increase vertical padding from `py-3` to `py-3.5` and item gap from `gap-8` to `gap-10` for breathing room.
- Edge fade gradients updated to match the new solid color.

## Left badge

Keep the "● LIVE MARKETS" pill. Drop the "· Indicative" suffix and the "Bid / Ask" header chip (both obsolete). Add a small "24h" label after "LIVE MARKETS" so users know what the % refers to:

```
● LIVE MARKETS · 24h
```

## Files

- `src/components/landing/MarketTicker.tsx` — only file touched. Remove `MAJOR_FIAT`, `getSpreadBps`, `decimalsForInverse`, the inverse chip, the bid/ask block, and the header chip. Simplify the row JSX and tune the container styling.

## Out of scope

- No data/edge-function changes.
- No new currencies or pairs.
- Inverse rates and bid/ask remain available on the Exchange page where they actually mean something.