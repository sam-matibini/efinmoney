# eFinMoney — Migration off Lovable Cloud

This document is the complete checklist for moving the project to your own
infrastructure (self-hosted Postgres + your own Supabase / edge runtime / object
storage). Nothing in this repo has been deleted as part of producing it.

> ⚠️ **Platform limits you must know up front (Lovable Cloud):**
> - The raw Postgres connection string, DB password, and `SUPABASE_SERVICE_ROLE_KEY` are **not exposed** to users.
> - `pg_dump` / full database dumps (SQL, JSON, Parquet, DuckDB, Excel) are **disabled**. Only per-table **CSV** export is supported.
> - There is **no bulk-download** tool for storage buckets. Files are reachable individually via signed URLs.
> - Secret **values** are not retrievable — only names. You'll need to re-issue or copy each value into your new environment from the upstream provider's dashboard.
>
> For a true `pg_dump` and bulk bucket contents, the supported path is **contact Lovable support**.

---

## 1. What's in this export

| File | Purpose |
| --- | --- |
| `MIGRATION.md` | This playbook |
| `DATABASE_SCHEMA.sql` | Full schema (tables, columns, types) — already in the repo |
| `migration-export/functions-and-secrets.json` | Machine-readable list of every edge function, its `verify_jwt` setting, env vars and public webhook URL, plus all secret names, buckets and extensions |
| `/admin/data-export` | New in-app page (super_admin gated) that downloads every public table as CSV individually or as a single ZIP |

---

## 2. Recommended migration order

1. **Provision target Postgres** (e.g. self-hosted Supabase, RDS, Neon, Railway).
2. **Enable required extensions** (Section 3) before loading the schema.
3. **Load `DATABASE_SCHEMA.sql`** — this creates tables, RLS policies, functions, triggers, and the chart of accounts.
4. **Recreate roles & grants** — Supabase's `anon`, `authenticated`, `service_role` exist by default on a fresh Supabase project; if you're going non-Supabase you'll need to model the equivalent roles. The schema file already includes GRANT statements.
5. **Restore data** — visit `/admin/data-export` in this app, click *Download all tables (ZIP)*, then `\COPY` each CSV into the target DB (Section 5).
6. **Recreate storage buckets** (Section 4) and re-upload files. For bulk file transfer contact Lovable support.
7. **Deploy edge functions** (Section 6) and configure secrets (Section 7).
8. **Re-register webhooks** with each third-party provider using the new function URLs (Section 6).
9. **Configure auth providers** (Section 8) in your new Supabase project.
10. **Cut over DNS** (`efin.money`, `www.efin.money`) once smoke tests pass.

---

## 3. Database extensions in use

| Extension | Used for |
| --- | --- |
| `pgcrypto` | `gen_random_uuid()`, `gen_random_bytes()` (short-link codes, IDs) |
| `pg_trgm` | Fuzzy matching for in-house AML/PEP name screening |
| `pg_net` | `net.http_post(...)` inside triggers/functions to invoke edge functions (`invoke_send_email`, `invoke_generate_receipt`, `invoke_aml_screen`) |

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

---

## 4. Storage buckets

All three are **private**. Files are accessed via signed URLs from authenticated code.

| Bucket | Public | Notes |
| --- | --- | --- |
| `assets` | No | Static assets used at runtime (e.g. spinner video) |
| `kyc-documents` | No | KYC uploads (passport, address proof, selfies). PII — handle with care. |
| `customer-documents` | No | CRM-side customer document storage |

```sql
INSERT INTO storage.buckets (id, name, public) VALUES
  ('assets',             'assets',             false),
  ('kyc-documents',      'kyc-documents',      false),
  ('customer-documents', 'customer-documents', false);
```

For **bulk file download** there is no self-serve tool — contact Lovable support and ask for a bucket archive.

---

## 5. Data export (CSV-only on Lovable Cloud)

Use `/admin/data-export` (sign in as a super_admin). The page lists all 95 public tables and offers:
- per-table CSV download, and
- a *Download all tables (ZIP)* button that paginates each table (1 000 rows at a time) and bundles every CSV into one zip.

Exports run through the authenticated Supabase client and therefore **respect RLS** — sign in as the highest-privilege role that should see the data.

To import into the target Postgres:

```bash
unzip efinmoney-export-YYYY-MM-DD.zip -d export/
for f in export/*.csv; do
  table=$(basename "$f" .csv)
  psql "$NEW_DATABASE_URL" -c "\copy public.$table FROM '$f' WITH CSV HEADER"
done
```

Tables with foreign keys to `auth.users` (`profiles`, `wallets`, `user_roles`, etc.) require the matching auth users to exist first — restore `auth.users` (via Supabase admin API or `INSERT`) before the `public` tables that reference them.

---

## 6. Edge functions

96 functions are deployed. See `migration-export/functions-and-secrets.json` for the canonical list with env vars and webhook URLs. Grouping for orientation:

| Domain | Functions |
| --- | --- |
| **Stripe – payments** | `stripe-charge-card`, `stripe-charge-saved-card`, `stripe-create-checkout-session`, `stripe-payment-intent`, `stripe-save-card`, `stripe-save-card-confirm`, `stripe-config-status`, `stripe-mode-check`, `stripe-webhook`, `stripe-payin-webhook` |
| **Stripe – payouts (Visa Direct)** | `stripe-payout`, `stripe-payout-webhook` |
| **Stripe Connect (instant)** | `stripe-connect-create-account`, `stripe-connect-account-session`, `stripe-connect-refresh-status`, `stripe-connect-instant-payout` |
| **Stripe Issuing (cards)** | `stripe-issuing-create-card`, `stripe-issuing-card-details`, `stripe-issuing-update-card`, `stripe-issuing-fund-card`, `stripe-issuing-balance`, `stripe-issuing-webhook` |
| **Stripe Treasury** | `treasury-list`, `treasury-create-fa`, `treasury-reveal-account-numbers`, `treasury-inbound-transfer`, `treasury-outbound-transfer`, `treasury-outbound-payment`, `treasury-webhook` |
| **Circle CPN** | `circle-quote`, `initiate-cpn-payout`, `circle-webhook`, `circle-reconcile` |
| **Crossmint + Yellow Card** | `crossmint-create-order`, `crossmint-webhook`, `yellowcard-payout`, `yellowcard-webhook` |
| **PawaPay (Africa mobile money)** | `pawapay-payout`, `pawapay-webhook` |
| **Paysafe (CA Interac/EFT)** | `paysafe-payout`, `paysafe-webhook` |
| **Flutterwave** | `flutterwave-payout`, `flutterwave-webhook`, `flw-bill-payment`, `flw-create-virtual-account`, `flw-get-banks`, `flw-get-billers`, `flw-initialize-payment`, `flw-resolve-account`, `flw-verify-payment` |
| **Elicate** | `elicate-payout`, `elicate-webhook`, `elicate-reconcile` |
| **M-Pesa** | `mtn-momo-payout`, `mtn-momo-webhook` |
| **Plaid** | `plaid-create-link-token`, `plaid-exchange-token`, `plaid-refresh-balances` |
| **Persona KYC** | `create-persona-inquiry`, `get-persona-inquiry-status`, `persona-webhook`, `persona-self-approve` |
| **Sumsub EDD** | `sumsub-create-applicant`, `sumsub-refresh-token`, `sumsub-get-applicant-status`, `sumsub-webhook` |
| **Interac OIDC KYC** | `interac-start`, `interac-callback`, `interac-exchange`, `interac-jwks` |
| **Stellar / SEP-31** | `generate-stellar-wallet`, `stellar-add-trustline`, `stellar-anchor-discovery`, `stellar-anchor-transfer`, `stellar-send-payment`, `stellar-sep31-payout` |
| **FX / market** | `fx-engine`, `refresh-fx-rates`, `market-rates` |
| **Transfers / banking** | `execute-transfer`, `cancel-transfer`, `internal-transfer`, `intra-ca-transfer-create`, `bank-reconciliation` |
| **Crypto** | `crypto-trading`, `execute-crypto-swap` |
| **Cards (internal)** | `backfill-card-currency` |
| **KYC / admin / compliance** | `approve-kyc`, `reject-kyc`, `admin-create-user`, `admin-delete-user`, `compliance-monitoring` |
| **Notifications / receipts** | `send-email`, `send-statement-email`, `generate-receipt`, `notify-user` |
| **Diagnostics** | `test-integrations` |

### Function deployment notes
- Most functions use `verify_jwt = false` and validate auth in code. The JSON file lists the exact `verify_jwt` value per function.
- Webhook URLs in this project are of the form `https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/<function-name>`. On the new project, replace the host with your new Supabase project URL and **re-register every webhook with the provider** (Stripe, Circle, Crossmint, Yellow Card, PawaPay, Paysafe, Flutterwave, Elicate, Persona, Sumsub, etc.).
- Functions that call other edge functions from DB triggers (`invoke_send_email`, `invoke_generate_receipt`, `invoke_aml_screen`) hard-code the project URL inside the SQL function body — update those after deploying the schema.

---

## 7. Secrets (names only)

Every secret currently configured is listed in `migration-export/functions-and-secrets.json` under `secrets`. **Values are not retrievable.** For each:

- **Re-issue from the provider** (Stripe, Circle, Crossmint, Yellow Card, PawaPay, Paysafe, Flutterwave, Elicate, Persona, Sumsub, Plaid, OpenExchangeRates, Resend, M-Pesa, Interac). Use the provider's dashboard.
- **Replace** for the new Supabase project: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWKS`, `SUPABASE_DB_URL`.
- **Drop** `LOVABLE_API_KEY` — that one only exists on Lovable Cloud (AI Gateway + connectors). If you want to keep AI / email features, swap to the provider directly (OpenAI, Resend, etc.) and rewrite the calls.
- **Generate fresh** for `STELLAR_ENCRYPTION_KEY` (and re-encrypt any encrypted blobs) and `STELLAR_TREASURY_SEED` only if you're rotating treasury — otherwise copy the exact seed across or you'll lose access to the on-chain treasury.

---

## 8. Auth providers

Configured in Supabase (Lovable Cloud → Users → Auth Settings). Defaults used by this app:
- Email + password (with Password HIBP check enabled per project policy).
- Google OAuth.

Re-enable both in the new Supabase project's Authentication → Providers panel and copy the redirect URLs into the Google Cloud OAuth client. The app expects users in `auth.users`; the `handle_new_user` trigger in `DATABASE_SCHEMA.sql` populates `profiles`, default wallets (USD + CAD), the `user_roles` row, the Tier 1 `user_risk_tiers` row, an empty `kyc_verifications` row, and sends the welcome email.

---

## 9. Database functions & triggers (highlights)

Already in `DATABASE_SCHEMA.sql`. Most notable:

- `handle_new_user()` — new-signup bootstrap (trigger on `auth.users`)
- `has_role(uid, role)` / `is_admin_user(uid)` / `is_kyc_reviewer(uid)` / `is_super_admin(uid)` — security-definer role checks used in every RLS policy
- `get_wallet_balance(wallet_id)` / `get_user_wallet_balances(user_id)` — derived balances from the double-entry ledger
- `execute_fx_swap(...)` — ledger-only FX swap
- `check_transfer_balance()` — pre-insert balance enforcement on `transfers`
- `run_compliance_checks(transfer_id)` + `trigger_compliance_check()` — velocity/amount/structuring rules
- `on_kyc_status_change()` — auto-tier upgrade + account-number issue
- `create_short_link()` / `resolve_short_link()` — efin.money/s/<code> redirects
- `aml_normalize_name()` + `tg_transfers_aml_screen()` — in-house AML invocation
- `invoke_send_email()` / `invoke_generate_receipt()` / `invoke_aml_screen()` — `pg_net` HTTP calls to edge functions (update hard-coded URLs after migration)
- `check_rate_limit(key, max, window_seconds)` — DB-backed rate limiter

---

## 10. What is **not** in this export

| Item | Why | Where to get it |
| --- | --- | --- |
| Postgres connection string / password | Not exposed on Lovable Cloud | Contact Lovable support |
| `pg_dump` of the live database | Disabled platform-wide | Contact Lovable support |
| Bulk download of storage bucket files | No bulk tool exists | Contact Lovable support (or write a signed-URL loop) |
| Secret values | Only names are retrievable | Re-issue from each provider |

Nothing has been deleted as part of producing this export.
