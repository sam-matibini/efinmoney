## Goal
Replace the "Issuing pending enablement" sandbox path with real Stripe Issuing card creation and a secure in-browser PAN/CVV reveal using Stripe Issuing Elements.

## Prerequisite (you)
- Confirm `STRIPE_SECRET_KEY` in Lovable Cloud secrets is a **live** key on the Stripe account where Issuing is approved.
- Stripe Issuing must be enabled in **live** mode (already confirmed).
- I'll request the secret via `add_secret` if not present / needs swap.

## Changes

### 1. Edge functions
- `stripe-issuing-create-card`:
  - Remove silent sandbox fallback. If `STRIPE_SECRET_KEY` missing or Stripe call fails, return 400 with the Stripe error so the UI shows the real reason (no fake last4 anymore).
  - Pre-fund the Issuing balance check: surface clearer error when `balance_insufficient` (Issuing requires funded Issuing balance in `usd`/`cad`).
  - Keep idempotency key on cardholder; add idempotency key on card create (`card:{user_id}:{ts}` from client-supplied `client_ref`).
- `stripe-issuing-card-details`:
  - Already returns `ephemeralKeySecret` + `issuingCardId`. Add `nonce` validation (require client nonce, pass to Stripe).
- New tiny helper not needed — existing function suffices.

### 2. Frontend — secure reveal
- New component `src/components/cards/StripeIssuingReveal.tsx` using `@stripe/react-stripe-js`:
  - On mount: generate a `nonce` via `loadStripe(...).then(s => s.createEphemeralKeyNonce(...))`.
  - Call `stripe-issuing-card-details` with `{ card_id, nonce }`.
  - Render `<IssuingCardNumberDisplay>`, `<IssuingCardCvcDisplay>`, `<IssuingCardExpiryDisplay>` (from `@stripe/react-stripe-js`) inside an `Elements` provider configured with `{ stripeAccount? , ephemeralKeySecret, issuingCardId, nonce }`.
- `src/pages/EfinCardDetailPage.tsx`:
  - Replace the current `reveal` block + `handleReveal` with mounting `<StripeIssuingReveal cardId={card.id} />` inside a collapsible panel (toggle via Reveal/Hide button).
  - Remove the "sandbox" toast/placeholder path for non-sandbox cards. Keep sandbox message only when `card.metadata.sandbox === true` (legacy rows).
- `MockEfinVisaCard.tsx`: remove "Issuing pending enablement" chip + "preview only" footer (or gate behind `isMock` prop and stop passing it once issuance is live). Keep file as a marketing/visual mock; remove from real card flow.

### 3. Publishable key
- Read `VITE_STRIPE_PUBLISHABLE_KEY` from env (already used elsewhere via `src/lib/stripe.ts`); confirm and reuse.

### 4. Out of scope
- No DB migration. Existing `issued_cards`, `cardholders`, `card_spending_controls` tables stay as-is.
- Funding / authorizations / webhook flow already in place — untouched.
- Apple/Google Pay provisioning (push-provisioning) is a separate Stripe approval; not included.

## Technical notes
- Stripe Issuing Elements (`@stripe/react-stripe-js` ≥ 6) expose `IssuingCardNumberDisplay`, `IssuingCardCvcDisplay`, `IssuingCardExpiryDisplay`, `IssuingCardPinDisplay`. They require an `Elements` instance loaded with the publishable key, plus per-card `ephemeralKeySecret` + `nonce`. PAN/CVV never touch our servers — Stripe-hosted iframes render them.
- After deploy, first card issuance attempt against live Issuing will succeed only if the Issuing balance has funds. We'll surface the "Top up Issuing balance" error verbatim so you can fund via Stripe Dashboard.

## Files touched
- `supabase/functions/stripe-issuing-create-card/index.ts`
- `supabase/functions/stripe-issuing-card-details/index.ts`
- `src/components/cards/StripeIssuingReveal.tsx` (new)
- `src/pages/EfinCardDetailPage.tsx`
- `src/components/cards/MockEfinVisaCard.tsx` (remove pending chip)
