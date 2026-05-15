## Goal

Add **Stripe Card Push (Visa Direct / debit-card payouts)** as a third Canadian payout method alongside the existing **Interac e-Transfer** and **EFT** (both via Paysafe). User picks the method on the Canada send screen. Paysafe stays untouched; Stripe is added next to it. Uses the existing `STRIPE_SECRET_KEY` already in secrets.

## Important upfront caveat

Stripe **card push payouts** (sending money TO a debit card via the Visa Direct / Mastercard Send rails) require Stripe to explicitly enable the **"Card payouts"** capability on your account. This is **not on by default** and is gated by Stripe Risk. Without it, the API call returns `parameter_invalid_empty: external_account` or `payouts_not_allowed`. Once code ships, if Stripe hasn't enabled the capability, the user-facing experience will be the same kind of friendly error we already show for Paysafe PAYMENTHUB-1 — funds refunded, transfer marked failed, message: *"Card payouts are not yet enabled on our payments provider."*

The technical pattern: create a Stripe **Connect Custom connected account** for each recipient with a `card` external account (the recipient's debit card, tokenized client-side), then `POST /v1/payouts` against that connected account in CAD with `method: instant`. Funds settle to the card in seconds.

## What we'll build

### 1. Database

New migration:
- Add `'card_push'` to the existing `payout_method` literal usage (it's a free `text` column on `transfers`, so no enum change needed — just frontend/backend code accepts it).
- New table `stripe_payout_recipients` (recipient card vault, per sender):
  - `user_id` (sender), `recipient_name`, `recipient_email`, `last4`, `brand`, `stripe_account_id` (Connect acct), `stripe_external_account_id` (card token), `created_at`
  - RLS: owner-only.
- Extend `transfers.provider_reference` usage to also store Stripe payout id (`po_…`); no schema change needed.

### 2. New edge function: `stripe-payout`

Mirrors `paysafe-payout`'s contract so `execute-transfer` can route to it:

Input: `{ transfer_id }`

Flow:
1. Service-role load the transfer (`payout_method = 'card_push'`, `recipient_country = 'CA'`).
2. Read recipient card token + cardholder details from the request payload (passed forward by `execute-transfer`, which the frontend collected via Stripe.js).
3. Create or reuse a **Stripe Custom connected account** for `(sender_id, recipient_email)` — country `CA`, capabilities `card_payments` + `transfers`, `business_type: individual`, prefilled with cardholder name.
4. Attach the debit card as an **external account** (`type: card`) on that connected account.
5. Create a **payout** on the connected account: `amount`, `currency: cad`, `method: instant`, `destination: <card_id>`, `metadata: { transfer_id }`.
6. On success → mark transfer `processing`, store `provider_reference = po_…`.
7. On failure → call existing refund helper to credit the sender wallet back, mark `failed`, write a friendly `failure_reason`, return `{ success: false, code, refunded: true }`.
8. Friendly error mapping for `payouts_not_allowed`, `card_declined`, `external_account_*`, `insufficient_capabilities`.

### 3. New edge function: `stripe-payout-webhook`

Receives Stripe events (separate endpoint from the existing `stripe-webhook` which handles top-ups; mixing them risks regressing top-up logic). Subscribe to:
- `payout.paid` → mark transfer `completed`, set `completed_at`.
- `payout.failed` / `payout.canceled` → mark `failed`, refund wallet, store reason.

Verifies signature with a new secret `STRIPE_PAYOUT_WEBHOOK_SECRET` (separate from existing `STRIPE_WEBHOOK_SECRET` to keep top-up and payout webhooks isolated).

`verify_jwt = false` in `supabase/config.toml` for this function.

### 4. `execute-transfer` routing

Add a third branch:

```
if (transfer.transfer_type === "domestic_canada" && transfer.payout_method === "card_push") {
  → call stripe-payout
} else if (domestic_canada) {
  → call paysafe-payout (existing)
} else {
  → call flutterwave-payout (existing)
}
```

Pass through the card token and cardholder fields it received from the frontend.

### 5. Frontend: `CanadaSendFlow.tsx`

- Extend `Method` from `"interac" | "eft"` to `"interac" | "eft" | "card_push"`.
- Add `card_push` option in the method picker with label **"Debit card (instant)"**, fee `$1.50` (configurable), badge "Funds in seconds".
- New step-2 fields when `card_push` selected:
  - Recipient full name (cardholder name)
  - Debit card details collected via **Stripe.js `<CardElement>`** — never touches our server unencrypted. Tokenize → get a card token, send token + last4/brand to `execute-transfer`.
- Reuse `friendlyFailureReason()` extension on `TransferTrackingPage.tsx` to map Stripe payout error codes.

### 6. Frontend: small Stripe.js helper

`src/lib/stripeJs.ts` already exists for top-ups. Reuse the same `loadStripe(STRIPE_PUBLISHABLE_KEY)` instance; add a `tokenizeDebitCard(elements)` helper that returns `{ token, last4, brand }`.

### 7. Settings panel (`StripeConfig.tsx`)

Add a small read-only section: **"Card-push payouts (Visa Direct)"** showing whether the capability is enabled (best-effort check via `GET /v1/accounts` once on mount), with the new payout webhook URL `…/functions/v1/stripe-payout-webhook` to copy into Stripe Dashboard.

## What the user must do in Stripe Dashboard

1. Email Stripe support → request **"Enable card payouts (Visa Direct / Mastercard Send) in CAD on this account"**. Stripe Risk approves on a case-by-case basis.
2. Once approved, create a **new webhook endpoint** in the Stripe Dashboard pointing to `…/functions/v1/stripe-payout-webhook`, subscribed to `payout.paid`, `payout.failed`, `payout.canceled`.
3. Copy the webhook signing secret and we'll add it as `STRIPE_PAYOUT_WEBHOOK_SECRET` (I'll prompt at the end).

Until step 1 is done, the new option will be visible but every send will fail gracefully with the friendly "card payouts not enabled" message — exactly like the Paysafe corridor situation today.

## Files touched

- **migration** — new `stripe_payout_recipients` table + RLS
- **new** `supabase/functions/stripe-payout/index.ts`
- **new** `supabase/functions/stripe-payout-webhook/index.ts`
- **edit** `supabase/functions/execute-transfer/index.ts` — add card_push branch
- **edit** `supabase/config.toml` — add `[functions.stripe-payout-webhook] verify_jwt = false`
- **edit** `src/components/send/CanadaSendFlow.tsx` — third method, card form
- **new** `src/lib/stripePayouts.ts` — Stripe.js debit-card tokenization helper
- **edit** `src/pages/TransferTrackingPage.tsx` — extend `friendlyFailureReason()`
- **edit** `src/components/settings/integrations/StripeConfig.tsx` — payout-webhook URL block

## Out of scope (can be follow-ups)

- Saving recipient cards for repeat sends (vault exists in DB; UI to pick a saved recipient is later).
- Paysafe replacement (you chose to keep Paysafe alongside).
- Bank-account (EFT-via-Stripe) payouts — different code path; only doing card_push now.
