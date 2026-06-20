# Fix FX Calculator (BWP) + Build Errors

The calculator returns "Rate unavailable" because our FX provider (OpenExchangeRates) is rate-limited until **2026-06-29**, so no BWP rows exist in `fx_rates`. Also clearing the pre-existing TS build errors flagged by the builder (Adyen, admin_users, cards).

## 1. Make FX feed resilient (real fix for the calculator)

`supabase/functions/refresh-fx-rates/index.ts`:
- Try OpenExchangeRates first.
- On failure (429 / network / no key), **fall back to `https://open.er-api.com/v6/latest/USD`** — free, no API key, covers BWP and all our SUPPORTED currencies.
- Same downstream math (cross-rates via USD, 0.5% markup), same `fx_rates` insert.

After the change, invoke the function once so BWP cross-rates populate immediately. The landing-page `LiveFxCalculator` will then resolve CAD↔BWP without any UI change.

Also seed a one-time set of BWP rows via a small immediate insert (no migration needed — just call the refreshed function) so the calculator works without waiting on the OpenExchangeRates quota reset.

## 2. Schema fixes for admin_users (resolves 8 TS errors)

Migration to add the columns the app already reads/writes:
- `admin_users.email text`
- `admin_users.status text default 'active'`
- `admin_users.phone text`

Affected files compile again automatically once the regenerated `types.ts` includes the new columns:
- `src/contexts/AdminAuthContext.tsx` (id/role/status/full_name/permissions)
- `src/hooks/useUserRoles.tsx` (status/role)
- `src/pages/admin/StaffDetailPage.tsx`, `StaffPage.tsx`, `StaffOnboardingPage.tsx` (phone)

## 3. Schema fixes for cards (resolves 3 TS errors)

Migration:
- `cards.currency_code text`
- `cards.balance numeric not null default 0`

Backfill `currency_code` from the linked wallet where `wallet_id is not null`. Resolves the `useCards.tsx` casts.

## 4. AdyenReturnHandler typing

`src/components/payments/AdyenReturnHandler.tsx` line 86: `result?.sessionResult` isn't in the Drop-in `PaymentCompletedData` type but is present at runtime. Cast `result` to `any` for that property access only — single, localized fix.

## 5. Verification

- Hit `refresh-fx-rates` → confirm `success:true` and BWP rows in `fx_rates`.
- Reload landing page → CAD 1000 → BWP shows a real quote (≈ 9-10k BWP), and the "Rate unavailable" banner disappears.
- Build passes (no TS errors).

## Notes

- No UI/visual changes — only the calculator's rate lookup starts returning real numbers.
- New columns are nullable / defaulted so existing rows aren't broken.
- The fallback FX source stays in place even after OpenExchangeRates resets, so we won't see this outage again.
