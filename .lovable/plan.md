
## Payment Link as a delivery method

Today /send debits the sender and pushes funds to a known destination (Interac email, EFT bank, debit card, Stripe Connect). For "Payment Link", the sender doesn't need the recipient's details upfront — they generate a one-time link, the recipient opens it, chooses how they want to be paid, and we disburse on their behalf.

### How it works (sender flow)

1. On `/send?mode=canada` (and Cross-border Send), add a 5th delivery tile: **Payment Link**.
2. Sender enters amount + optional recipient name/note. No bank/email/card needed.
3. On confirm:
   - Funds are **escrowed**: DR sender wallet (`2101 USD/2102 CAD…`) / CR `2199 Payouts Pending Claim` (new COA line).
   - A `payment_link_payouts` row is created (`status=pending`, 7‑day expiry, single‑use).
   - A short link `efin.money/s/<code>` is generated via existing `create_short_link` RPC, pointing to `/claim/<code>`.
   - Sender sees the link in the success screen with copy / share / email / SMS actions and a "Revoke" button.
4. Sender can revoke any unclaimed link from `/transactions` → returns funds (reverse escrow journal).

### How it works (recipient flow at `/claim/<code>`)

- Public page (no login required) shows: sender name, amount, currency, expiry countdown.
- Recipient picks one Canadian rail:
  - **Interac e‑Transfer** — email + security Q/A
  - **Debit card** — Stripe card‑push tokenization widget
  - **EFT bank** — institution / transit / account
- Light verification: name + email + basic anti‑abuse (rate limit, IP, optional SMS OTP if amount ≥ C$500).
- On submit → edge function `claim-payment-link` runs the existing payout path for the chosen rail and posts the release journal: DR `2199 Payouts Pending Claim` / CR `1108 Adyen Settlement` or the rail's settlement account, mirroring current Paysafe/Stripe flows. The original `transfers` row gets the resolved recipient details, `delivery_method`, and `status=completed`.
- Recipient sees confirmation + receipt link.

### Invoices

In `sales_invoices`, add **"Pay by Link"** as a *receive* mode (today pay‑by‑link goes through Adyen for pay‑ins — unchanged). For **refunds/disbursements from an invoice**, add a "Send as Payment Link" action that calls the same create flow above with `source='invoice'` and links the row back to `sales_invoices.id`.

### Database

Migration adds:
- `public.payment_link_payouts`
  - `id`, `sender_id`, `source` (`send` | `invoice`), `source_ref` (uuid), `amount`, `currency`,
    `recipient_name`, `recipient_note`, `short_code` (unique), `status`
    (`pending` | `claimed` | `expired` | `revoked` | `failed`),
    `expires_at` (default `now() + 7 days`), `escrow_journal_id`, `release_journal_id`,
    `claimed_method` (`interac` | `card_push` | `eft`), `claimed_payload` (jsonb — masked),
    `claimed_at`, `claimed_ip`, `transfer_id`, `created_at`, `updated_at`.
- GRANTs to `authenticated` + `service_role`. No `anon` grants — claims go through an edge function using the short code (not table reads).
- RLS: sender can `SELECT`/`UPDATE` (revoke only) own rows; admins full.
- COA: add `2199 Payouts Pending Claim` for CAD + USD + EUR + GBP.
- Trigger: auto‑expire job via `expires_at` checked at claim‑time + a scheduled function that flips stale rows to `expired` and reverses escrow.

### Edge functions

- `payment-link-create` — validates KYC tier limits, posts escrow journal, calls `create_short_link`, returns `{ url, code, expires_at }`.
- `payment-link-resolve` — public (no JWT): returns sender display name, amount, currency, status, expiry for the claim page.
- `payment-link-claim` — public: validates code, rate‑limits per IP, runs chosen rail (reuses `paysafe-payout`, `stripe-card-push`, etc.), posts release journal, completes `transfers` row.
- `payment-link-revoke` — sender‑auth: reverses escrow if still `pending`.
- `payment-link-expire-cron` — scheduled hourly; flips stale rows + reverses escrow.

### Frontend

- `src/components/send/CanadaSendFlow.tsx`: add `paylink` delivery tile, conditional form (just amount + note), success view with copy/share/QR/revoke.
- `src/components/send/CrossBorderSendFlow.tsx` (existing cross‑border send): same tile added.
- `src/pages/ClaimPaymentLinkPage.tsx`: new public route `/claim/:code`, rail picker (re‑uses Interac/EFT/Stripe card push forms already in `CanadaSendFlow`).
- `src/pages/TransactionsPage.tsx`: show paylinks with status badge + revoke action.
- `src/pages/admin/AdminPaymentLinksPage.tsx`: admin view at `/admin/payments/links` (force‑expire, audit).
- `src/pages/SalesInvoicesPage.tsx`: "Send as Payment Link" action on refund/disbursement.

### Security & limits

- Auth: create/revoke require user JWT; claim uses short code + DB‑backed rate limit (10/min/IP) + optional SMS OTP when amount ≥ C$500.
- Tier limits enforced via existing `user_risk_tiers`.
- Idempotency: `short_code` unique; claim is single‑shot via `UPDATE … WHERE status='pending' RETURNING`.
- Logs: every create/claim/revoke writes to `audit_logs` and triggers in‑app + email notifications.

### Out of scope

- Multi‑use / split links, custom expiry, non‑CAD rails (USD/EUR claim rails will arrive when those payout providers do), recurring/standing links.
