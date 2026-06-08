
# Stripe Treasury — Finance Dashboard Integration

Adds a new **Treasury** tab inside `/finance` that manages Stripe Treasury FinancialAccounts (FAs) for both the platform and individual users, with live ACH inbound/outbound, Issuing-card funding, and a webhook feed that posts to the existing double-entry ledger.

## Prerequisites (you confirm before we go live)

1. Stripe Treasury is **enabled on the platform account** (US-only, invite-only — confirm in Stripe Dashboard → Treasury).
2. Platform is on **Stripe Connect Custom** with Treasury + Issuing capabilities (already partially in place via `stripe_connected_accounts`).
3. New secrets to add (I'll request via the secrets tool when we enter build mode):
   - `STRIPE_TREASURY_WEBHOOK_SECRET` (separate endpoint signing secret)
   - `STRIPE_PLATFORM_FA_ID` (optional; auto-created on first use if missing)

`STRIPE_SECRET_KEY` is already configured.

## Scope

- **View**: FAs (platform + per-user), available/pending balances, ABA routing + account numbers (with reveal-on-click), transactions list, statements (PDF link from Stripe).
- **Inbound transfers**: ACH debit pull from a linked external bank → FA (`InboundTransfers` API).
- **Outbound transfers**: ACH credit / domestic wire from FA → external bank (`OutboundTransfers`), and ACH/wire to third parties (`OutboundPayments`).
- **Issuing card funding**: Move FA balance → Issuing balance (`OutboundTransfers` to Issuing).
- **Feed → ledger**: Webhooks for `treasury.financial_account.*`, `treasury.received_credit/debit.*`, `treasury.inbound_transfer.*`, `treasury.outbound_transfer.*`, `treasury.outbound_payment.*` post balanced journals.

## Placement

New tab inside `src/pages/FinanceDashboard.tsx`, between **Banking** and **Reports**:

```text
Accounting | Banking | Treasury | Reports | Sales Tax | Vendors | Invoices | Bills | FX | Crypto
```

Treasury tab has sub-tabs: **Accounts**, **Transfers In**, **Transfers Out**, **Card Funding**, **Activity**.

Access gated to roles `admin` and `finance` (matches the rest of `/finance`).

## What gets built

### 1. Database (one migration)

- `treasury_financial_accounts` — mirror of Stripe FA: `stripe_fa_id`, `owner_kind` ('platform'|'user'), `user_id` (nullable), `connected_account_id` (nullable), `currency`, `aba_routing`, `account_number_last4`, `status`, `features` jsonb, balances cache, timestamps.
- `treasury_transfers` — unified record for inbound/outbound/payment: `kind`, `stripe_id`, `fa_id`, `amount`, `currency`, `direction`, `status`, `counterparty` jsonb, `network` ('ach'|'us_domestic_wire'), `failure_reason`, `journal_id` (FK → ledger journal), timestamps.
- `treasury_received_entries` — raw feed of received_credit / received_debit with linkage to a journal.
- `treasury_webhook_events` — idempotency log (event id unique).
- COA additions: `1250 Stripe Treasury - USD` (asset, per-FA sub-accounts via existing pattern), `1251 Stripe Treasury In-Transit`, `2110 Customer Treasury Liability - USD` (for per-user FAs).
- RLS: users see only their own FA + transfers; admin/finance see all; service_role full access. Standard GRANTs.

### 2. Edge functions (new)

- `treasury-list` — GET FAs, balances, transfers for the caller (scoped by role).
- `treasury-create-fa` — POST: create a FA (platform or for a given connected account); idempotency-keyed.
- `treasury-reveal-account-numbers` — POST: returns full account/routing via Stripe `retrieve` with `expand[]=financial_addresses.aba.account_number`; rate-limited + audit-logged.
- `treasury-inbound-transfer` — POST: create InboundTransfer from a linked `linked_funding_sources` row.
- `treasury-outbound-transfer` — POST: create OutboundTransfer (to external bank, Issuing balance, or another FA).
- `treasury-outbound-payment` — POST: create OutboundPayment to a third-party bank.
- `treasury-webhook` — receives Treasury events, verifies signature with `STRIPE_TREASURY_WEBHOOK_SECRET`, upserts into `treasury_*`, and posts ledger journals via existing patterns.

All functions: zod-validated input, `auth.uid()` checks, rate-limiting via `check_rate_limit`, structured errors with CORS.

### 3. Ledger posting rules

| Event                           | Dr                                  | Cr                                                |
| ------------------------------- | ----------------------------------- | ------------------------------------------------- |
| InboundTransfer succeeded       | 1250 Treasury (FA sub)              | 1251 Treasury In-Transit                          |
| InboundTransfer posted (funded) | 1251 Treasury In-Transit            | 2110 Customer Treasury Liab. (user FA) / 1242 (platform FA) |
| OutboundTransfer / Payment      | 2110 / 1242 (per owner)             | 1250 Treasury (FA sub)                            |
| ReceivedCredit                  | 1250                                | 2110 / 1242                                       |
| ReceivedDebit                   | 2110 / 1242                         | 1250                                              |
| Failure reversal                | Mirror entry against same journal   | —                                                 |

All journals carry `external_reference = stripe_id` for reconciliation.

### 4. Frontend (`src/components/finance/treasury/`)

- `TreasuryPanel.tsx` — sub-tab shell.
- `FinancialAccountsList.tsx` — table of FAs (platform + user-scoped), balances, status, "Reveal account #" button.
- `CreateFinancialAccountDialog.tsx` — admin-only.
- `InboundTransferDialog.tsx` — pick funding source + amount.
- `OutboundTransferDialog.tsx` — destination (bank / FA / Issuing) + network (ACH/wire) + amount.
- `OutboundPaymentDialog.tsx` — third-party payee + bank details.
- `TreasuryActivityTable.tsx` — unified feed of transfers + received entries with status badges and journal links.
- Hook `useTreasury.tsx` (react-query) wraps the edge functions.

Adds a new tab trigger in `FinanceDashboard.tsx`.

### 5. Reconciliation hook

Each Treasury journal links back via existing **General Ledger** account-drill (1250 sub-accounts). Reports Centre picks them up automatically since they're standard ledger entries.

## Out of scope (call-outs)

- Treasury is **USD only**; CAD/other currencies remain on Paysafe/Plaid.
- No physical-mail statement archival — we link to Stripe-hosted PDFs.
- Maker-checker on outbound transfers above a threshold is a follow-up (table exists; we can wire it in v2).
- We will **not** auto-create per-user FAs on signup. They're created on demand by admin or via a "Activate USD bank account" CTA (gated to tier_3 KYC + US residency).

## Open items I need from you in build mode

1. Confirm Treasury is enabled in your live Stripe account (or you want me to also handle the test-mode path first).
2. Should outbound transfers above a $ threshold require maker-checker? If yes, what threshold?
3. Webhook endpoint URL for `treasury-webhook` will be `https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/treasury-webhook` — you'll register it in Stripe Dashboard after I deploy and give you the signing secret name.
