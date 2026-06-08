---
name: Stripe Treasury
description: Stripe Treasury integration with Finance Dashboard tab. FAs for platform + per-user, ACH/wire inbound and outbound, third-party payments, webhook-driven double-entry ledger postings.
type: feature
---
- UI: `src/pages/FinanceDashboard.tsx` Treasury tab → `src/components/finance/treasury/TreasuryPanel.tsx`.
- Hook: `src/hooks/useTreasury.tsx` invokes edge functions.
- Edge functions: `treasury-list`, `treasury-create-fa`, `treasury-reveal-account-numbers`, `treasury-inbound-transfer`, `treasury-outbound-transfer`, `treasury-outbound-payment`, `treasury-webhook`.
- Shared helpers: `supabase/functions/_shared/treasury.ts` (Stripe + auth + role check).
- Tables: `treasury_financial_accounts`, `treasury_transfers`, `treasury_received_entries`, `treasury_webhook_events`.
- Chart of Accounts: 1270 Stripe Treasury - USD (asset), 1271 Stripe Treasury In-Transit (asset), 2120 Customer Treasury Liability - USD.
- User FAs require existing `stripe_connected_accounts` row.
- Ledger via webhook only (signed by `STRIPE_TREASURY_WEBHOOK_SECRET`). Inbound/outbound dr/cr per plan: user FA → 2120, platform FA → 1202.
- Webhook URL: `https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/treasury-webhook` (register in Stripe Dashboard with separate signing secret).
- Reveal account numbers rate-limited 5/5min via `check_rate_limit`, audit-logged.
- USD-only. No maker-checker threshold wired (table exists for v2).
