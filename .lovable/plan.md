# Fix Claim Error + Enable Debit Card Receipt

## 1. Fix the ledger UUID error

`supabase/functions/payment-link-claim/index.ts` passes the 7-char short code (`"BJBNADV"`) into `ledger_entries.reference_id`, which is a UUID column — same bug pattern as `payment-link-create`.

**Fix:** use the new `releaseJournalId` UUID as `reference_id` on both release ledger lines, and keep the short code only in the `description` (already there) and on the `payment_link_payouts` row.

## 2. Activate "Debit card" claim

Reuse the existing **Stripe Card Push Payouts (Visa Direct)** integration (see `mem://features/stripe-card-push-payouts`) to deliver funds to a recipient's Canadian debit card.

### Claim page (`src/pages/ClaimPaymentLinkPage.tsx`)
- Enable the **Debit card** tile (remove `disabled`).
- When selected, render a Stripe **CardElement** (already used in `SaveCardForm.tsx` / `CardPaymentForm.tsx`) inside an `Elements` provider to collect card details and tokenize client-side.
- Also collect: cardholder name (reuses "Your full name"), email (for receipt), postal code (from Stripe element).
- On submit: create a Stripe **PaymentMethod** (`stripe.createPaymentMethod({ type: 'card' })`), then POST to `payment-link-claim` with `method: "card_push"` and `payload: { payment_method_id, card_last4, card_brand }`.
- `isValid` for `card_push` becomes: name ≥ 2 chars, valid email, Stripe element complete.

### Edge function (`supabase/functions/payment-link-claim/index.ts`)
- Accept `payment_method_id` in payload (instead of the placeholder `card_token` check).
- After atomic claim + ledger release, when `method === "card_push"`:
  1. Call Stripe `payouts.create` via the existing card-push helper pattern (mirrors `stripe-card-push-payout` edge function): create a destination from the PaymentMethod and push the CAD amount.
  2. On Stripe failure → `rollback()` (already defined) + revert ledger by posting a reversing journal, return 502 with provider message.
  3. On success → store `provider_reference: pi.id` on the `transfers` row and `claimed_payload.stripe_payout_id`.
- Keep Interac/EFT branches as-is (they remain "settled to clearing" placeholders for now).

### Secrets
Uses the existing `STRIPE_SECRET_KEY` already configured for Visa Direct — no new secrets.

## Out of scope
- No DB migration (schema already supports `card_push`).
- No changes to sender-side `CanadaSendFlow.tsx`.
- No new tables, routes, or admin UI.
