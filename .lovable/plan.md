## Root cause

The landing-page calculator calls the `market-rates` edge function, not `fx_rates` directly. That function only returns 8 hardcoded pairs (USD↔CAD/NGN/KES/GHS/ZMW, CAD→NGN, GBP→USD, EUR→USD). **BWP is not in that list**, so `buildUsdMap` has no BWP entry and `midRate(CAD, BWP)` is `null` → "Rate unavailable for this pair".

The underlying `fx_rates` table already has fresh BWP rows (CAD→BWP ≈ 9.69), so no provider work is needed — only the edge function's pair list.

## Fix

Edit `supabase/functions/market-rates/index.ts`:

1. Replace the 8 hardcoded `FIAT_PAIRS` with pairs auto-generated from a `SUPPORTED` list that matches `refresh-fx-rates` (USD, CAD, EUR, GBP, NGN, KES, UGX, TZS, ZMW, BIF, MZN, GHS, RWF, XAF, XOF, MWK, ZAR, **BWP**). Emit `USD↔X` for every non-USD currency so `buildUsdMap` can derive every cross-rate the calculator needs.
2. Keep the existing 60s in-memory cache, 24h change calc, and crypto block unchanged.
3. Redeploy `market-rates`.

## Verification

- After redeploy, hit the landing page → CAD 1000 → BWP shows ~9,600 BWP and the "Rate unavailable" banner disappears.
- Other new corridors (e.g. CAD→MWK, CAD→XAF) also resolve.
- No DB migration, no UI changes, no impact on `refresh-fx-rates`.
