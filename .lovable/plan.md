## Problem

CAD→NGN (and other corridors) launched from `/send` with a saved card all fail at "Processing Payout" with `Missing card token for card-funded transfer`.

Root cause: there are two card-funding paths and they collide.

- **SendPage.tsx (saved-card path)** — charges the card upfront via the `stripe-charge-saved-card` edge function (PaymentMethod off-session), then creates the transfer with `funding_source: 'card'`, then invokes `execute-transfer` **without** a `card_token`.
- **execute-transfer/index.ts (lines 148–190)** — whenever `funding_source === 'card'`, it tries to charge the card **again** through `stripe-charge-card`, which requires `card_token`. Since SendPage never tokenized a raw card (it used a saved PaymentMethod), there is no token to send → the function marks the transfer `failed` with that message before any payout is attempted.

The Canada/USD card flow (`CanadaSendFlow.tsx`) tokenizes the card with Stripe Elements and does pass `card_token`, so it is unaffected. The `/send/cpn` flow uses `funding_source: 'wallet'` and is also unaffected.

## Fix

Teach `execute-transfer` that a card-funded transfer can already be pre-funded, and have SendPage tell it so.

### 1. `supabase/functions/execute-transfer/index.ts`
- Read `payload.prefunded` (boolean) and an optional `payload.charge_reference` (string — Stripe PaymentIntent id from the upfront charge).
- In the `if (isCardFunded)` block:
  - If `prefunded === true`, **skip** the entire `stripe-charge-card` call (no double charge, no `card_token` requirement). Optionally write `charge_reference` to `transfers.provider_reference` so we keep a pointer to the Stripe charge.
  - Otherwise behave exactly as today (require `card_token`, call `stripe-charge-card`).
- The downstream ledger logic that debits account `1102 Stripe Card Receivable` for card-funded transfers stays as-is — the money is in Stripe in both cases, so the accounting is identical.

### 2. `src/pages/SendPage.tsx` (around line 617)
- When invoking `execute-transfer` after a successful `stripe-charge-saved-card`, include:
  ```ts
  prefunded: true,
  charge_reference: chargeData?.payment_intent_id ?? chargeData?.charge_id ?? null,
  ```
- No other behavioral changes; the existing payout / Stellar / PawaPay branches keep working.

### 3. No other callers to change
- `CanadaSendFlow.tsx` already sends `card_token` → still works (prefunded path is not triggered).
- `MobileMoneyModal.tsx` uses `funding_source` from its own state but never sets it to `'card'` for this flow; behavior unchanged.
- `/send/cpn` uses wallet funding; unchanged.

### 4. Backfill note (informational)
The three existing failed CAD→NGN rows in `transfers` (`e072c561…`, `b09ef8a0…`, `478e9b25…`) stay marked `failed`. Their Stripe charges did succeed (Step A completed before Step C failed) — if the user wants, I can follow up with a one-off remediation to either retry the payout or refund those charges. Not in scope for this fix unless requested.

## Verification

After the change:
1. From `/send`, choose a saved card, send a small CAD→NGN amount.
2. Expect: Step A charges the card, Step B creates the transfer, Step C calls `execute-transfer` which now proceeds straight to the Flutterwave/Stellar/PawaPay payout step without erroring on the missing token.
3. `transfers` row should advance from `processing` → `completed` (or stay `processing` pending webhook), with `provider_reference` populated from the Stripe charge.
