
# EfinCards — Virtual Credit Card Platform (Stripe Issuing, Canada)

A complete card-issuing module that lets verified users and businesses create, fund, control, and use virtual Visa cards backed by their eFinMoney wallets. Built on Stripe Issuing (CA), funded from existing CAD/USD wallets and EFT, with real-time authorization against the eFinMoney ledger.

This is a multi-week build. The plan is organized in phases so we can ship usable value at the end of each phase and de-risk Stripe Issuing onboarding (which requires Stripe to enable your account for Issuing in Canada — typically a few business days).

## Scope confirmed
- Provider: **Stripe Issuing (Canada)** — single provider, no abstraction layer for now.
- Eligibility: **KYC Tier 3 only** (ID + address verified).
- Funding: **Wallet balance + EFT top-up** (via existing Plaid/Paysafe rails).
- Build everything in the spec: consumer virtual cards, business expense cards, spend controls, Apple/Google Pay, AI fraud, dashboards, notifications.

## What changes for the user

Navigation gets a unified **Cards** hub:

```text
Cards
├── My Cards            (list of virtual cards)
├── New Card            (create flow)
├── Card details        (transactions, controls, freeze, fund)
├── Business Cards      (admin issues to employees, sets limits)
└── Card Settings       (defaults, notifications, Apple/Google Pay)
```

A card detail view shows: masked PAN, balance/spend, transactions, freeze toggle, spending controls, fund button, and "Add to Apple/Google Pay".

## Phase 1 — Foundations & Stripe Issuing onboarding (week 1)

Goal: Provision the integration without breaking the existing mocked card UI.

1. **Stripe Issuing enablement** — request Issuing on the existing Stripe Connect account (CAD). Add `STRIPE_ISSUING_WEBHOOK_SECRET` secret. Stripe approval is async; the rest of Phase 1 can proceed against test mode.
2. **Database schema** (migration):
   - `cardholders` — eFinMoney user ↔ Stripe Issuing cardholder (id, user_id, stripe_cardholder_id, type [individual|company], legal_name, billing address, phone, email, status, kyc_verified_at).
   - `issued_cards` — supersedes mock `cards` for issued products (id, user_id, cardholder_id, stripe_card_id, last4, brand, currency, status [active|frozen|cancelled], card_type [virtual|physical], purpose [personal|business|single_use|subscription], funding_wallet_id, created_at).
   - `card_spending_controls` — per-card limits (daily/weekly/monthly caps, allowed/blocked MCCs, allowed countries, single-use flag, subscription merchant lock).
   - `card_authorizations` — real-time auth log (id, card_id, stripe_authorization_id, amount, currency, merchant_name, merchant_category, status [pending|approved|declined|reversed], decline_reason, created_at).
   - `card_transactions` — settled posted transactions (id, card_id, stripe_transaction_id, amount, currency, merchant_name, mcc, posted_at, authorization_id).
   - `card_funding_events` — top-ups into a card's funding (id, card_id, source [wallet|eft], amount, currency, ledger_journal_id, status).
   - `card_fraud_signals` — AI/rules output (id, card_id, signal_type, severity, score, details, resolved).
   - `business_card_programs` + `business_card_members` — for company expense cards (program owner, member user_id, role, per-member caps).
   - All tables RLS-restricted to owner / business admin / `admin` role via `has_role()`.
3. **Tier-3 gating** — reuse `useKyc`/`KYCGuard` to block `/cards/new` for users below Tier 3 and show the upgrade CTA.
4. **Keep mocked `cards` table intact** for back-compat while we migrate the UI to `issued_cards`.

## Phase 2 — Card issuance & wallet ledger funding (week 2)

5. **Edge functions** (`supabase/functions/`):
   - `stripe-issuing-create-cardholder` — idempotent; creates Stripe Issuing cardholder from profile.
   - `stripe-issuing-create-card` — creates virtual card, stores `issued_cards` row, returns masked details.
   - `stripe-issuing-card-details` — short-lived call that uses Stripe ephemeral keys to return PAN/CVV to the browser without us storing it (PCI scope-out).
   - `stripe-issuing-update-card` — freeze/unfreeze, cancel, update spending controls.
   - `stripe-issuing-fund-card` — moves funds from user wallet into a "card float" ledger account; double-entry journal entry; updates Stripe spending controls to match available balance.
6. **Ledger model** — add two ledger accounts per currency: `Card Float (Asset)` and `Card Liability to Cardholder (Liability)`. Funding card = Dr. user wallet liability / Cr. card liability. Spend = Dr. card liability / Cr. clearing. Settles when Stripe webhook posts.
7. **Funding sources** — UI offers (a) wallet balance instant transfer or (b) deep-link to existing EFT top-up flow to top wallet first.
8. **Tokenization** — never persist PAN/CVV/expiry server-side; client fetches details on demand via Stripe Issuing Elements iframe + ephemeral key.

## Phase 3 — Real-time authorization & transactions (week 3)

9. **Webhook handler** `stripe-issuing-webhook` for:
   - `issuing_authorization.request` → synchronous approve/decline based on: card status, ledger available balance, spending controls, fraud score. Replies within Stripe's 2s window.
   - `issuing_authorization.created/updated`
   - `issuing_transaction.created/updated` — posts settled txn, finalizes ledger.
   - `issuing_card.updated`, `issuing_dispute.*`.
10. **Authorization engine** — pure function that takes (card, controls, balance, signals) → approve/decline + reason. Logs to `card_authorizations`.
11. **Realtime updates** — enable Supabase Realtime on `card_authorizations` + `card_transactions` so the dashboard updates live.

## Phase 4 — UI: cards hub (week 3-4)

12. New routes under `/cards`:
    - `/cards` — grid of issued cards (live balance, last 3 txns, freeze toggle).
    - `/cards/new` — create flow (purpose, currency, funding wallet, controls preset).
    - `/cards/:id` — detail view: masked PAN with "Reveal" (Stripe iframe), transactions list, controls editor, fund button, Apple/Google Pay buttons, dispute action.
    - `/cards/settings` — defaults & notification prefs.
13. **Components**: `IssuedCardVisual`, `CardSpendChart` (recharts), `SpendingControlsForm`, `CardTransactionsTable`, `FundCardSheet`, `RevealCardModal` (Stripe Elements).
14. **Migrate** dashboard `CardsPage` & `WalletCarousel` card preview to read from `issued_cards`; keep legacy mock cards visible with a "Legacy" badge until the user re-issues.

## Phase 5 — Spend controls, single-use & subscription cards (week 4)

15. Controls UI maps directly to Stripe `spending_controls`: amount limits per interval, blocked categories (MCC), allowed countries.
16. **Single-use cards** — auto-cancel via `issuing_authorization.created` webhook after first successful capture.
17. **Subscription cards** — lock to first merchant seen; reject other merchants.

## Phase 6 — Wallet provisioning (Apple Pay / Google Pay) (week 5)

18. Use Stripe Issuing **push provisioning** (`@stripe/stripe-react-native` is not applicable — this is web; use **manual provisioning** flow + deep link to Stripe's hosted "Add to Wallet" page for iOS/Android web users; native wallet pay requires our app shell). Document the limitation; expose the API hook for a future native app.

## Phase 7 — Business expense cards (week 5-6)

19. `/admin/cards` or `/business/cards` for org owners:
    - Create program, invite employees (by email/efin_tag).
    - Issue per-employee virtual card with role-based caps (travel, SaaS, procurement templates).
    - Department tagging for expense reporting; export to existing Finance module.
20. RLS: program owner can see all member cards & txns; member only sees their own.

## Phase 8 — AI fraud monitoring & notifications (week 6)

21. **Rules engine** in the authorization edge function: velocity, impossible travel (compare last txn geo vs current), high-risk MCC, repeated declines, amount anomalies. Writes `card_fraud_signals`.
22. **AI layer** — Lovable AI Gateway (`google/gemini-2.5-flash`) summarizes signal clusters into human-readable alerts for the user and ops dashboard.
23. **Notifications** — extend existing `notifications` + `send-email` to fire on: auth approved (configurable), declined, low balance, suspicious activity, international transaction. Realtime toast via existing notifications channel.

## Phase 9 — Ops, compliance & polish (week 7)

24. **Admin portal** (`/admin/cards`) — search cards, view txns, force freeze, dispute management, fraud queue.
25. **Compliance hooks** — flag txns > $10k CAD into existing `compliance_alerts`; sanctions screen merchants list against existing rules.
26. **Reconciliation** — daily edge function compares Stripe Issuing transactions API vs `card_transactions` & ledger; surfaces mismatches in Finance dashboard.
27. **Settings panel** — Stripe Issuing config (test/live mode toggle, default currency, default controls) under existing Settings → Integrations.
28. **Docs** — update `PROGRESS.md`, `DATABASE_SCHEMA.sql`, add `mem://features/efincards-issuing` memory.

## Technical details (for review)

- **Stack**: existing Supabase + edge functions; Stripe Issuing API via `stripe` npm package in edge fns; `@stripe/stripe-js` + `@stripe/react-stripe-js` (already installed) on the client; Stripe Issuing Elements for PAN reveal.
- **Secrets needed**: existing `STRIPE_SECRET_KEY` (must have Issuing enabled), new `STRIPE_ISSUING_WEBHOOK_SECRET`.
- **Webhook URL**: `https://<project>.supabase.co/functions/v1/stripe-issuing-webhook` (registered with `verify_jwt = false` and signature verification in code).
- **PCI scope**: by using ephemeral keys + Stripe Elements iframe, the project stays in SAQ-A scope; we never see raw card data.
- **Idempotency**: every Stripe call uses an idempotency key keyed by `(user_id, action, nonce)`.
- **Rate limiting**: reuse `check_rate_limit()` on create/freeze/fund endpoints.
- **Ledger invariant**: every successful authorization either has a reserved ledger entry within 2s or it gets declined — keeps balances honest.
- **Test plan**: Stripe Issuing test cards & simulated authorizations (`POST /v1/test_helpers/issuing/authorizations`) — fully scriptable in CI.

## Out of scope (for now)
- Physical cards (Stripe Issuing CA supports them; we'll add after virtual is stable).
- Multi-provider abstraction (Adyen/Marqeta) — revisit later.
- Credit-line funding (only wallet + EFT).
- Native iOS/Android wallet push provisioning beyond the hosted handoff.

## Deliverable per phase
At the end of each phase the app is shippable: Phase 2 = create + reveal a test card; Phase 3 = real-time spend works; Phase 4 = polished UX; Phase 7 = business ready; Phase 9 = ops-ready.

---

Ready to start with **Phase 1** (Stripe Issuing enablement + database schema + Tier-3 gating). Approve this plan and I'll begin with the migration and the secret request.
