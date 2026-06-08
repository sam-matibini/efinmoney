## Goal

In the **Canada Domestic** tab of `/send`, add a new instant-payout delivery option that pushes funds from your eFinMoney CAD wallet (or a Visa/MC/Amex card) to **your own Stripe Connected Account** (the one created at `/stripe-connect`), then triggers an **instant payout** from that connected account to the debit card / Interac external account configured during embedded onboarding. This gives a complete self-loop test of the connected-account instant transfer feature without needing a second user.

## What you'll see in the UI

```text
Canada Domestic step 1 — Delivery method
┌──────────────────────────────────────────────────────────┐
│ 🟢 Interac e-Transfer      $0.50  next business day     │
│ 🏦 EFT bank deposit         free   1–2 business days     │
│ ⚡ Visa Direct (debit card) $1.00  instant               │
│ ⚡ Stripe Connect — instant $1.00  instant ← NEW         │
│    Pushes to your connected Stripe account               │
└──────────────────────────────────────────────────────────┘
```

When you pick **Stripe Connect — instant**:
- Recipient fields are auto-filled to **you** (your profile name + email). No recipient card entry.
- A green confirmation badge shows your `acct_…` ID, country, and `charges_enabled / payouts_enabled` flags. If the account is missing, not onboarded, or payouts aren't enabled, the option is disabled with a "Finish setup at /stripe-connect" link.
- Funding (wallet vs card) keeps the existing two-option behavior and fee logic.
- On submit, the existing wallet/card debit posts as today, then a new edge function runs the Stripe Transfer + Instant Payout chain on the connected account.

## Files to add / change

### New: `supabase/functions/stripe-connect-instant-payout/index.ts`
Internal function (called by `execute-transfer`, gated by `x-internal-secret`). Steps:
1. Look up `stripe_connected_accounts` for the transfer's `sender_id`. Require `status='active'` + capability `payouts.active`.
2. `POST /v1/transfers` on the platform with `amount`, `currency: 'cad'`, `destination: acct_…`, `metadata.transfer_id`.
3. `POST /v1/payouts` with `Stripe-Account: acct_…`, `method: 'instant'`, `amount`, `currency: 'cad'`, `metadata.transfer_id`.
4. Return `{ success, stripe_transfer_id, stripe_payout_id, status }`.
5. On any Stripe error → refund wallet (reuse the `refundWallet` pattern in `stripe-payout`) and return `{ success:false, error, code, refunded:true }`.

The existing `stripe-payout-webhook` already handles `payout.paid / failed / canceled` and refunds via `transfer_id` metadata, so this new flow plugs into it without changes.

### Edit: `supabase/functions/execute-transfer/index.ts`
Add a branch when `payout_method === 'stripe_connect'` → invoke `stripe-connect-instant-payout` instead of `stripe-payout` / Paysafe. Same response shape.

### Edit: `src/components/send/CanadaSendFlow.tsx`
1. Extend `DeliveryMethod` union with `"stripe_connect"`; add to `DELIVERY_FEES` (C$1.00, matches card-push parity).
2. New hook call: query `stripe_connected_accounts` for current user; derive `connectReady = status==='active' && capabilities.payouts==='active'`.
3. Add the 4th delivery card; disable + link to `/stripe-connect` when not ready.
4. When method is `stripe_connect`: skip recipient-card section and skip recipient inputs (recipient is self). Render a small "Funds will land on your connected account `acct_…` → instant payout to your debit card / Interac" confirmation card.
5. In `handleSubmit`: when method is `stripe_connect`, do NOT tokenize a recipient card; pass `payout_method: 'stripe_connect'` to `createTransfer` and forward through to `execute-transfer`.

### New hook (small): `src/hooks/useStripeConnectedAccount.tsx`
React-Query reader for the current user's `stripe_connected_accounts` row. Used by `CanadaSendFlow` to gate the option.

## Out of scope (intentionally not changing now)

- No DB schema changes — uses existing `stripe_connected_accounts`, `transfers`, ledger tables.
- No changes to the Visa Direct / Interac / EFT branches.
- The eFinMoney-P2P and International tabs are untouched.
- `/stripe-connect` page itself is unchanged — it remains the setup entry point.

## Test path

1. Go to `/stripe-connect`, click **Create Connected Account**, finish embedded onboarding (add an external debit card or Interac account in test mode).
2. Open `/send` → **Canada Domestic** → pick **Stripe Connect — instant**.
3. Pick **Pay from CAD wallet** (or Pay with card with a Stripe test card), enter C$5.00, submit.
4. Expect: ledger debit, Stripe `tr_…` then `po_…` returned, transfer row marked `processing`/`completed`, webhook flips to `completed` on `payout.paid`, receipt email fires (existing trigger).
