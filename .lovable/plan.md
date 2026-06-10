## Update FX Calculator fees + add receiving grandma to hero image

### 1. Benchmark fees to Remitly / LEMFI (`src/components/landing/FxCalculator.tsx`)
Replace the current flat constants:
```
FEE_RATE = 0.005    // eFinMoney
BANK_MARGIN = 0.035 // baseline
```
with a benchmarked model that mirrors how Remitly and LEMFI actually price:

- `EFIN_FX_MARGIN = 0.008` (0.8% FX markup on mid-market — undercuts both)
- `EFIN_FLAT_FEE_USD = 0.99` (small flat fee, converted into `from` currency via `usdMap`)
- `REMITLY_MARGIN = 0.022` (~2.2% typical economy FX margin)
- `REMITLY_FLAT_FEE_USD = 3.99`
- `LEMFI_MARGIN = 0.018` (~1.8% FX margin)
- `LEMFI_FLAT_FEE_USD = 0` (LEMFI advertises zero fee, monetizes on spread)

Recompute:
- `effectiveRate = midRate * (1 - EFIN_FX_MARGIN)` and subtract flat fee from `sendAmt` before multiplying for the *recipient gets* number.
- Build a `compareRow(name, margin, flatUsd)` helper that returns `{ rate, recipientGets, totalCostInSend }`.
- Comparison strip becomes **3 rows**: eFinMoney (good), Remitly, LEMFI — each showing `1 FROM = X TO` and the per-provider effective fee (margin % + flat fee shown like "0.8% + $0.99").
- "You save with eFinMoney" headline = `bestCompetitorRecipientGets` vs eFinMoney recipient gets, converted back to send currency, plus % saved vs the cheaper of Remitly/LEMFI.
- Keep bidirectional editing: when user edits *recipient gets*, invert `(recv / effectiveRate) + flatFeeInFrom` to get `sendAmt`.
- Update the small footnote: "Indicative mid-market rate. 0.8% FX margin + $0.99 fee. Benchmarked against Remitly & LEMFI public pricing."
- Replace the "Typical bank" `Row` with the new 3-row comparison; tweak the `Row` component to accept an optional `subFee` line so "0.8% + $0.99" fits cleanly.

No backend / pricing-config changes — these are landing-page indicative benchmarks only, matching the existing "indicative" disclaimer.

### 2. Regenerate hero image with a receiving grandma
Re-generate `src/assets/landing-hero-users.jpg` (premium, 1280×960, same path so `Landing.tsx` import is unchanged):

> "Editorial split-scene photo: LEFT — a warm, smiling Black African grandmother in Lagos at her doorway joyfully receiving money on her smartphone (mobile money notification visible as soft glow, no readable text), a small grandchild beside her. RIGHT — the same family's adult children: a young Black Canadian professional couple in a bright Toronto loft looking together at a phone, clearly the senders. Soft natural light, shallow depth of field, candid, premium fintech lifestyle, emotional connection between the two scenes, no on-screen UI text, no logos."

This keeps the existing Canada-side family and adds the receiving grandma — visually telling the full send → receive story behind the calculator.

### 3. Untouched
- `src/pages/Landing.tsx` layout (headline, copy, image position, calculator float) — no edits.
- `src/lib/worldCurrencies.ts` — no edits.
- Bidirectional input, searchable currency picker, sign-in/sign-up handoff — preserved.

### Files
- **Edit:** `src/components/landing/FxCalculator.tsx` (fee model + 3-row comparison + footnote)
- **Replace asset:** `src/assets/landing-hero-users.jpg` (regenerate via imagegen)
