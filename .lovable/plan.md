# Fix: saved card currency defaulting to USD on /send

## Root cause

`saved_payment_methods.currency_code` is **null** for every existing card (the column was added recently and never backfilled). When the card has no currency, `SendPage` falls back to the profile's `default_currency`, which is `USD` for every user in the DB. Result: a real Canadian Mastercard is shown as USD, the FX rate becomes USD→ZMW instead of CAD→ZMW, and the card-charge currency is wrong.

The new-card path (`stripe-save-card-confirm` + `useSavedCards`) already writes `currency_code` correctly from `pm.card.country`, so this only affects pre-existing cards and any future cards where Stripe doesn't return a country.

## Plan

1. **Add `country_code` column** to `saved_payment_methods` (text, nullable) so we persist Stripe's `card.country` for audit and future re-derivations.

2. **New edge function `backfill-card-currency`** (verify_jwt = true):
   - Input: optional `payment_method_id`. If omitted, processes all of the caller's cards where `currency_code IS NULL`.
   - For each row, calls `stripe.paymentMethods.retrieve(pm_...)`, reads `card.country` (ISO‑2), maps via the existing `COUNTRY_CCY` table (CA→CAD, US→USD, GB→GBP, NG→NGN, etc.).
   - Updates `country_code` and `currency_code`. Falls back to profile `default_currency` only when Stripe returns no country.
   - Returns the updated rows.

3. **Auto-trigger from `useSavedCards`**: after the cards query resolves, if any row has `currency_code IS NULL`, fire-and-forget invoke `backfill-card-currency`, then refetch. One-shot per session via a ref guard so we don't loop.

4. **`SendPage` resilience tweak**: when `fundingSource === 'card'` and `activeSavedCard.currency_code` is null, show a small inline "Detecting card currency…" hint instead of silently using USD, and disable the Continue button until it resolves. Once the backfill runs the value populates and the FX rate / "card will be charged in X" line update automatically.

5. **No change** to ledger/transfer logic, fee math, or Stripe charge flow — they already consume `sourceCurrency` correctly once it's right.

## Technical notes

- Files touched:
  - `supabase/migrations/<new>.sql` — `ALTER TABLE saved_payment_methods ADD COLUMN country_code text;`
  - `supabase/functions/backfill-card-currency/index.ts` — new
  - `supabase/config.toml` — register the new function (default verify_jwt = true)
  - `src/hooks/useSavedCards.tsx` — auto-invoke + refetch
  - `src/pages/SendPage.tsx` — pending-state hint + button gating

- Reuses the existing `COUNTRY_CCY` map from `src/lib/currency.ts` (mirrored in the edge function, same as `stripe-save-card-confirm`).
- Requires `STRIPE_SECRET_KEY` (already configured).
- For the screenshot's card (Mastercard •1449, BENDICT UKWENYA): once backfilled, Stripe will return `card.country = 'CA'` → `currency_code = 'CAD'`, and Review & Confirm will read "C$ 4.99 CAD" with rate `1 CAD = … ZMW` and "redirected to a secure card checkout in CAD".
