# Flutterwave Integration Plan

## Important context first

Your project **already has** much of what this prompt asks to "create from scratch". Building it as specified would duplicate tables, break the existing ledger, and conflict with current flows. Here is what already exists vs. what's actually new.

### Already in the project (do NOT recreate)
- `wallets` table (multi-currency, `is_default`, status, RLS) + `get_user_wallet_balances` RPC
- **Double-entry `ledger_entries` + `ledger_accounts`** — this is the source of truth for balances. Balances are derived, never stored on the wallet row. The proposed `wallets.balance` column would break this.
- `transfers` table with provider_reference, status enum, fee, FX fields
- `beneficiaries` (`contacts`) table + `/contacts` page + picker
- `flutterwave-webhook` edge function (signature verify, ledger reversal on failure)
- `flutterwave-payout` edge function (bank/mobile money payout)
- `notifications`, KYC tier enforcement (`user_risk_tiers`), compliance triggers, receipt generation
- Pages: `/send` (CanadaSendFlow), `/wallets`, `/transfers`, `/transfers/:id`, `/contacts`
- Secrets already configured: `FLW_SECRET_KEY`, `FLW_PUBLIC_KEY`, `FLW_ENCRYPTION_KEY`

### Genuinely new work
- Virtual account numbers (NUBAN) for receiving — no table exists
- Bill payments (airtime/data/electricity) — no table or function exists
- Bank list + NUBAN account-name resolve helpers
- Card/bank/USSD top-up via Flutterwave Standard checkout
- Africa-specific send flow UI (current `/send` is Canada-focused)
- Webhook logs table for debugging
- Admin views for transactions/wallets/virtual accounts

## Proposed approach

### A. Schema additions (additive, no breaking changes)

```sql
-- Virtual accounts (new)
virtual_accounts(id, user_id, wallet_id, currency_code, account_number UNIQUE,
                 bank_name, account_name, flw_order_ref, flw_response jsonb,
                 is_permanent, expires_at, status)

-- Bill payments (new)
bill_payments(id, user_id, transfer_id NULL, category, biller_code, biller_name,
              customer_identifier, amount, currency, token, units, status,
              flw_response jsonb)

-- Webhook logs (new)
flw_webhook_logs(id, event, payload jsonb, processed bool, error text, received_at)

-- Cache (new)
flw_banks_cache(country, banks jsonb, fetched_at)
flw_billers_cache(country, category, billers jsonb, fetched_at)
```

RLS: users see only their own rows; admins see everything via `is_admin_user()`.

**Will NOT add:** new `wallets`, `transactions`, `beneficiaries` tables — they already exist and are wired into the ledger. New deposits/payouts will write `ledger_entries` (the existing pattern), not a parallel `transactions` table.

### B. Edge functions (new only; reuse existing where possible)

| Function | Status |
|---|---|
| `flw-create-virtual-account` | NEW |
| `flw-initialize-payment` (card/USSD/bank top-up) | NEW |
| `flw-verify-payment` | NEW |
| `flw-get-banks` | NEW (cached) |
| `flw-resolve-account` | NEW |
| `flw-get-billers` | NEW (cached) |
| `flw-bill-payment` | NEW |
| `flutterwave-webhook` | EXTEND existing — add `charge.completed` for top-ups & virtual-account credits, and `flw_webhook_logs` writes |
| Bank/mobile-money payout | REUSE existing `flutterwave-payout` |
| P2P internal transfer | REUSE existing `intra-ca-transfer-create` pattern (rename/generalize) |

All functions: JWT validation via `getClaims()`, Zod input validation, rate-limited via existing `check_rate_limit`, ledger-based credit/debit (no balance column writes).

### C. Frontend

- **New page `/wallet/receive`** — list virtual accounts per currency, copy/share
- **New page `/wallet/topup`** — currency + amount + method → hosted Flutterwave page → verify on return
- **New page `/pay-bills`** — category grid, biller picker, customer ID, pay
- **New Africa send flow** added as a tab/mode in existing `/send` (keep CanadaSendFlow intact)
- **Extend Dashboard** — add "Add Money", "Pay Bill" quick actions; virtual-account preview card if any exist
- **Admin** — new `/admin/virtual-accounts` and `/admin/bill-payments` pages; transactions/wallets admin views already exist in finance dashboard

Real-time: subscribe to `ledger_entries` for the user's wallet IDs (balances refresh automatically since they're derived).

### D. Secrets

Already present: `FLW_SECRET_KEY`, `FLW_PUBLIC_KEY`, `FLW_ENCRYPTION_KEY`.
Will request only if missing: `FLW_WEBHOOK_HASH` (already referenced in current webhook code — may already exist as build secret).

No new `FLW_TEST_*` variants — your code uses one set of keys and Flutterwave's test/live mode is determined by the key itself.

## What I need you to confirm before I build

1. **Do not duplicate the wallets/transactions/beneficiaries tables** — agree to reuse existing `wallets` + `ledger_entries` + `contacts`? (Strongly recommended; otherwise the double-entry ledger and all existing pages break.)
2. **Phase 1 scope** — start with: virtual accounts + receive page + top-up + webhook extension + bank list/resolve helpers. Phase 2: bill payments + Africa send UI + admin pages. OK to phase, or build everything in one pass?
3. **Africa send flow** — add as a new tab inside existing `/send` page, or replace the Canada flow? (I recommend adding as a tab.)

Reply with answers (or "go ahead, all in one pass, reuse existing tables, add as tab") and I'll implement.
