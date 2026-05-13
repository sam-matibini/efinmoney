## Problem

On `/send`, when the user picks **Card** as the funding source, the "You Send" field always shows `$` and the helper text says "Card will be charged in USD" — regardless of the card's actual issuing country, the bank account's currency, or the user's default wallet. The same applies to **Bank**: the picker normalizes Plaid accounts to a hardcoded `USD`. Only the **Wallet** option correctly reflects the chosen wallet's currency.

Root cause: `saved_payment_methods` has no currency field, the Plaid normalizer in `SendPage.tsx` hardcodes `currency_code: 'USD'`, and the `sourceSymbol` ternary only knows `CAD → C$` vs `$`.

## Fix

### 1. Capture each saved card's billing currency
- Add `currency_code text` to `public.saved_payment_methods` (nullable).
- In `stripe-save-card-confirm`: read `pm.card.country` (issuing country, ISO‑2) and map it to a currency via a small ISO country→currency table (CA→CAD, US→USD, GB→GBP, NG→NGN, KE→KES, ZA→ZAR, etc.). Fall back to the user profile's `default_currency`, then `USD`. Persist on insert.
- Backfill: leave existing rows null (the UI fallback below handles them).

### 2. Use real currencies in the Bank picker
- In `SendPage.tsx`, stop hardcoding `currency_code: 'USD'` for the Plaid normalization. Use the row's existing `plaid_accounts.currency_code` (already defaults to `CAD` in DB, populated per‑account).
- Also `select` `currency_code` in the `plaid_accounts` query.

### 3. Drive `sourceCurrency` from the actual selection
- For **Card**: use the *selected* `savedCards` row's new `currency_code`. Fallback chain: card.currency_code → profile.default_currency → wallet's default currency → `USD`.
- For **Bank**: use the selected bank source's `currency_code` (now real, per #2).
- For **Wallet**: unchanged.
- Track the selected card via `selectedSavedCardId` (already in state) so changing cards updates the displayed currency live.

### 4. Correct the currency symbol everywhere
- Replace the inline ternary at line 178‑180 with a tiny `currencySymbol(code)` helper covering the currencies the app supports (CAD→C$, GBP→£, EUR→€, NGN→₦, KES→KSh, ZAR→R, GHS→₵, UGX→USh, TZS→TSh, ZMW→ZK, RWF→FRw, USD→$, fallback → currency code). Use it in the `You Send` input prefix and the helper text ("Card will be charged in {sourceCurrency}").

### 5. Keep downstream behaviour intact
- `cardChargeCurrency()` (USD/NGN constraint for Flutterwave card capture) and the `usdRate` conversion to `cardChargeAmount` already handle non‑USD source currencies — no change needed.
- FX lookup `from_currency = sourceCurrency → target` already works because it reads whatever `sourceCurrency` resolves to; ensure rates exist for new pairs (no schema change, just relies on `useFxRates`).

## Files touched

- `supabase/migrations/<new>.sql` — add `currency_code` to `saved_payment_methods`
- `supabase/functions/stripe-save-card-confirm/index.ts` — derive + store card currency
- `src/hooks/useSavedCards.tsx` — add `currency_code` to type
- `src/pages/SendPage.tsx` — real bank currency, card‑driven `sourceCurrency`, symbol helper, helper‑text update
- `src/lib/utils.ts` (or new `src/lib/currency.ts`) — `currencySymbol(code)` helper

## Out of scope

- Wallet/bank UIs outside `/send` (MobileMoneyModal already shows wallet currency correctly).
- Multi‑currency Stripe charging — Stripe still captures in USD/NGN; only the *display* and the *ledger source_currency* reflect the funding source's true currency. The existing `usdRate` conversion handles the difference.
