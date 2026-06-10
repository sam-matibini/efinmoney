## Goal

1. Remove all public mentions of "Remitly" and "LEMFI" from the landing FX calculator — show them as anonymous "Typical market rate" benchmarks instead.
2. Keep the actual benchmark numbers (intrinsically matching Remitly's economy tier) but only surface the named "Remitly benchmark" inside the Admin → Pricing & Fees tab, where staff can see and edit it.

## Changes

### 1. `src/components/landing/FxCalculator.tsx` (public landing — anonymized)

- Replace the two competitor rows with a single consolidated row labelled **"Typical market rate"** (uses the worse — i.e. more expensive — of the two existing benchmarks so the savings claim stays conservative and credible).
  - Row layout stays the same (rate + small fee/spread note like `~2.2% + fee`).
- Savings calculation continues to use `bestCompetitorRecv = Math.max(remitlyRecv, lemfiRecv)` internally — only the label changes.
- "You save with eFinMoney" headline → **"You save vs. typical market rate"**.
- Footnote text updated to:
  *"Indicative mid-market rate · 0.8% FX + $0.99 fee. Benchmarked against typical international money-transfer providers. Rate locks for 60 s after sign in."*
- No competitor brand names anywhere in JSX, badges, alt text, or comments visible to end users. Internal constant names renamed to neutral `BENCHMARK_A_*` / `BENCHMARK_B_*` to avoid the brand strings leaking via source maps.

### 2. `src/components/settings/PricingSettingsPanel.tsx` (admin-only — named benchmark)

Add a new card **"Competitor Benchmark (internal)"** above the existing "Transfer Fee Structure" card. Admin-only context (this panel already lives under `/settings` → Pricing & Fees, gated by the admin dashboard route).

Card contents (read/edit form, plain inputs — no DB wiring in this pass, stored values will live alongside other pricing inputs already in this panel which are also UI-only):

```text
Competitor Benchmark (internal — not shown on landing page)
┌────────────────────────────────────────────────────────┐
│ Remitly  FX margin: [2.20] %     Flat fee: [3.99] USD │
│ LEMFI    FX margin: [1.80] %     Flat fee: [0.00] USD │
│ eFinMoney target:  match Remitly economy tier          │
│ Current eFinMoney: 0.80% FX + $0.99 flat               │
└────────────────────────────────────────────────────────┘
[ Save Benchmarks ]
```

Short helper text under the card title explains: *"These values feed the 'Typical market rate' comparison on the public calculator. Names are visible to staff only and never rendered on the landing page."*

### Out of scope

- No database schema changes. (`pricing_config` already exists; wiring the benchmark values to it can be a follow-up.)
- No change to `FxCalculator` math, currency picker, or hero layout.
- No change to images, hero copy, or `Landing.tsx`.

## Files touched

- Edit: `src/components/landing/FxCalculator.tsx`
- Edit: `src/components/settings/PricingSettingsPanel.tsx`
