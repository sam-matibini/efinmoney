
# Stripe Cross-Border — Implementation Plan

Scope: **International pay-in** (any country → eFin wallet) + **card-push payouts** extended from CA-only to **US, UK, EU**. Africa continues using PawaPay + Circle CPN (unchanged).

---

## What you need to provide

### From your Stripe Dashboard (no new code keys — existing `STRIPE_SECRET_KEY` works)
1. **Enable cross-border payment methods** in Dashboard → Settings → Payment methods:
   - Cards (already on), Apple Pay, Google Pay, Link
   - Optional local methods: iDEAL (NL), Bancontact (BE), SEPA (EU), BACS (UK)
2. **Enable Stripe Connect** if not already: Dashboard → Connect → Get started → "Platform" (you already use Connect Custom for CA payouts, so likely on).
3. **Request card-payout capability for US/UK/EU** on your Connect platform: Dashboard → Connect → Settings → Capabilities. May require Stripe review (1–5 days). Reply when approved.
4. **Add a new webhook endpoint** for pay-in events. I'll give you the URL after deploy; you paste the resulting signing secret as `STRIPE_PAYIN_WEBHOOK_SECRET`.

### From you (decisions, no code)
- **Top-up fee** you want to charge users on pay-in (e.g. 1.5% + $0.30). Stripe's own cost is ~2.9% + $0.30 domestic / ~3.9% + $0.30 international card.
- **Min/max top-up per transaction** (e.g. $5 – $5,000 CAD equivalent).
- **Wallet credit currency** for non-CAD/USD pay-ins: convert to user's default wallet, or auto-create a wallet in the pay-in currency?

### Nothing else needed
All required secrets are already configured: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PAYOUT_WEBHOOK_SECRET`.

---

## What I'll build

### 1. International pay-in (Top-up wallet from anywhere)
- New `/topup/stripe` flow using **Stripe Checkout** (hosted, supports 40+ local payment methods automatically based on customer location/currency).
- Edge function `stripe-create-checkout-session`:
  - Accepts: amount, currency, target wallet
  - Returns: Checkout URL
  - Charges Stripe fee + your platform markup
- Edge function `stripe-payin-webhook`:
  - Listens for `checkout.session.completed` and `payment_intent.succeeded`
  - On success: posts double-entry ledger (debit Stripe receivable, credit user wallet liability), records platform fee revenue
  - Handles refunds/chargebacks (reverse ledger)
- New ledger accounts: `1208 — Stripe Receivable (CAD/USD)`, `4xxx — Top-up Fee Revenue`.
- FX handling: if user pays in EUR and wants CAD wallet credit, use Stripe's `currency_conversion` settlement.

### 2. Card-push payouts to US / UK / EU
- Extend existing `stripe-payout` edge function to accept `recipient_country` in `[CA, US, GB] + EU-27`.
- On first payout to a new corridor, create a Connect Custom account in that country.
- Reuse existing `stripe_payout_recipients` vault (already keyed by user + recipient email).
- Add corridor allow-list in `/send` flow UI: show "Instant to debit card" only for supported countries.
- Africa corridors continue showing PawaPay + Circle CPN options (unchanged).

### 3. UI changes
- **`/topup`**: add "Pay with card (any country)" option alongside existing methods. Currency selector.
- **`/send`**: the destination-country picker already exists. For US/UK/EU, add "Instant to debit card (via Stripe)" as a payout method.
- Settings → Integrations → **Stripe**: status card showing connected account, enabled corridors, capabilities, monthly volume.

### 4. Compliance & ledger
- All pay-ins/payouts pass through existing AML screening (`tg_transfers_aml_screen`).
- Receipts auto-generated (existing `generate-receipt` flow).
- All Stripe events recorded in `webhook_events` for replay/audit.

---

## What I will NOT build (out of scope)
- Stripe payouts to Africa (NG, KE, GH, UG, TZ, ZM, MW, RW, CD) — use PawaPay/Circle CPN.
- Stripe Issuing cards (separate effort).
- ACH pay-in (US-only, can add later if needed).

---

## Deliverables order
1. DB migration: new ledger accounts + `stripe_payin_sessions` table.
2. Edge functions: `stripe-create-checkout-session`, `stripe-payin-webhook`.
3. Extend `stripe-payout` for US/UK/EU.
4. Frontend: top-up Stripe flow + send-flow corridor expansion.
5. Settings panel for Stripe status.
6. Tell you the webhook URL → you paste back the signing secret.

---

## Open question for after approval
Do you want pay-in available to **logged-in users only** (top-up own wallet), or also as a **public payment link** (anyone can pay you/an invoice)? Default = logged-in users only.
