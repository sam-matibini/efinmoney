# Live mode + instant-to-card delivery

Three independent changes.

## 1. Activate sender card fields
The Stripe Elements provider fix from last turn is correct. The remaining cause of dead fields is almost certainly that `STRIPE_PUBLISHABLE_KEY` is missing or stale. I'll trigger the secret-update form so you paste **live** values for both:
- `STRIPE_PUBLISHABLE_KEY` → `pk_live_…`
- `STRIPE_SECRET_KEY` → `sk_live_…`

After submission a hard-refresh of the preview will mount the real Stripe iframes and the Card Number / Expiry / CVC inputs will accept focus and typing.

## 2. Switch Paysafe to production
The code already branches on `PAYSAFE_ENV` (`live` → `https://api.paysafe.com`, otherwise → `https://api.test.paysafe.com`). No code change needed — only secrets.

I'll trigger the secret-update form for:
- `PAYSAFE_ENV` → `live`
- `PAYSAFE_API_KEY` → live `username:password` Basic-auth pair from your Paysafe live account
- `PAYSAFE_ACCOUNT_ID` → live merchant account ID for CAD (Interac + EFT + card)
- `PAYSAFE_WEBHOOK_SECRET` → the live webhook HMAC secret you configure in Paysafe Hub

After saving, the next /send completion will hit `api.paysafe.com` and move real money. Make sure your Paysafe live account has Interac e-Transfer, EFT **and** Credit/Debit Card payment methods enabled in CAD (your screenshot confirms all three are Enabled).

## 3. Add "Instant to debit card" as a 3rd delivery option (Visa Direct)
Re-introduce the push-to-card payout alongside Interac and EFT.

### UI (`src/components/send/CanadaSendFlow.tsx`)
- `DeliveryMethod` becomes `"interac" | "eft" | "card_push"`.
- Step 1 grid becomes 3 tiles:
  - Interac e-Transfer — C$0.50 · ~30 min
  - Bank Transfer (EFT) — Free · 1–3 business days
  - **Instant to debit card (Visa Direct)** — C$1.00 · arrives in seconds
- `DELIVERY_FEES.card_push = 1.0`.
- Step 2 conditional rendering when `method === "card_push"`:
  - Recipient name (already there)
  - **Recipient debit card section** (new) — its own `<CardNumberElement>` / `<CardExpiryElement>` / `<CardCvcElement>` group, labeled "Recipient's debit card (where funds land)". Tokenized with `tokenizeDebitCard(stripe, recipientCardEl, { name: recipientName, currency: "cad" })` — the `currency: "cad"` is required for Visa Direct.
  - Recipient email becomes optional (used only for the receipt notification).
- Funding-source toggle (wallet vs sender card) stays as-is for all three delivery methods.
- When both sender card funding AND recipient card delivery are used, the form contains **two distinct** Stripe element groups; both are tokenized in `handleSubmit` (sender first → fund, recipient second → payout token).
- Submit button label adapts: `"Send C$X via Interac / Bank Transfer / Visa Direct"`.
- `handleSubmit` passes `recipient_card_token` + `recipient_last4` + `recipient_brand` to `execute-transfer` when `method === "card_push"`.

### Edge function (`supabase/functions/execute-transfer/index.ts`)
- After the existing payout-routing branch on `isCanada`, split further:
  - `payout_method === "card_push"` → POST to `stripe-payout` (already deployed) with `{ transfer_id, card_token: recipient_card_token, last4, brand, amount_cents, currency: "cad" }`.
  - else → existing `paysafe-payout` call.
- Keep the wallet/card **funding** logic untouched (works for all delivery methods).

### `stripe-payout` function
Already exists from the prior push-to-card work — no changes needed beyond confirming it reads `STRIPE_SECRET_KEY` (live now) and that the platform Stripe account has Visa Direct/OCT enabled for CAD. If Visa Direct isn't enabled on the Stripe account, the function will return a clear error and the transfer is marked failed — funds (if card-funded) will need a refund flow which is **not** in scope for this change.

### Out of scope
- Saving recipient cards for reuse
- 3-D Secure on funding charges
- Auto-refunding sender card if recipient Visa Direct push fails (manual ops for now)
- Touching Flutterwave / Africa corridors
- Removing legacy unused `stripe_payout_recipients` rows

## Order of execution
1. Open `update_secret` for the 5 Stripe + Paysafe secrets so you can paste them.
2. While you fill those, edit `CanadaSendFlow.tsx` to add the 3rd delivery tile and recipient-card section.
3. Edit `execute-transfer/index.ts` to route `card_push` to `stripe-payout`.
4. Deploy `execute-transfer`.
5. You hard-refresh and test all three delivery methods end-to-end with live keys.