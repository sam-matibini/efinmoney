## Phase 1 — Critical Fixes (Exchange & Core Flows)

Note: A scan of the codebase shows the project has moved past several items in `KNOWN_ISSUES.md` (last updated 2026-04-11):
- `fx_rates` already holds 60+ live pairs (multi-corridor, valid_until=NULL).
- `ExchangePage.tsx` no longer uses hardcoded `1.35` fallbacks — it surfaces a toast when no rate exists.
- `crypto-trading` and `fx-engine` edge functions have full validation, rate limiting, and routing; no errors in recent logs (logs empty = no recent invocations to confirm health).
- `WalletCard` "Receive" button was replaced with "Top-up" + "Statement". There is still no dedicated **Receive** flow showing account number / QR.

So Phase 1 narrows to four concrete, high-value fixes:

---

### 1. Smoke-test & instrument the Exchange edge functions

Goal: prove `crypto-trading` and `fx-engine` work end-to-end and surface failures clearly.

- Invoke `crypto-trading` with `{ action: 'pairs' }`, `{ action: 'quote', ... }`, and `{ action: 'execute', ... }` against the deployed function; confirm 200s and check ledger entries for `execute`.
- Invoke `fx-engine` with `quote` and `execute` for an existing user wallet pair (e.g. USD→CAD); verify a journal_id is returned and `execute_fx_swap` posts balanced debit/credit ledger entries.
- If any path fails, fix the routing/handler in `supabase/functions/<name>/index.ts` and redeploy.
- Add a single `console.error('[fn:action]', err)` line at each catch so future failures show up in logs.

### 2. Tighten client-side error UX in Exchange

Goal: never fail silently if the edge function returns an error.

- In `src/components/crypto/CryptoTradingPanel.tsx` and `src/pages/ExchangePage.tsx` (`FxTradingPanel`): when `supabase.functions.invoke` returns `{ error }` OR `data.error`, surface the message via `toast.error(...)` and keep the form enabled.
- Replace silent empty states for crypto prices/pairs with a retry button and a visible error message.

### 3. Build the Receive flow on `WalletCard`

Goal: replace the missing "Receive" affordance with a real modal showing how to fund this wallet.

- Add a new `ReceiveMoneyModal` component (`src/components/wallet/ReceiveMoneyModal.tsx`) that, for the selected wallet, shows:
  - The user's `profiles.account_number` and `@efin_tag` (already in DB).
  - A QR code encoding `efin://pay?to=<account_number>&currency=<code>` using `qrcode.react` (add dependency).
  - Copy-to-clipboard buttons for account number, tag, and email.
  - A short "Share payment request" link.
- Add a small **Receive** button beside Send/Top-up in `WalletCard.tsx` (keep Top-up as the funding/CAD-in entry point).
- No DB changes required — fields already exist.

### 4. Refresh FX rates on a schedule

Goal: keep `fx_rates` fresh so quotes don't drift; the table already has data but no auto-refresh cadence visible.

- Confirm whether an `fx-refresh` (or equivalent) edge function + pg_cron job exists. If not, add a pg_cron entry (every 15 min) that calls the existing rate-fetch function (OpenExchangeRates is already configured via `OPENEXCHANGERATES_APP_ID`).
- Insert via the insert tool (per stateful-data rule), not a migration.

---

### Technical details

- **Files to edit:**
  - `src/components/ui/WalletCard.tsx` — add Receive button
  - `src/components/wallet/ReceiveMoneyModal.tsx` (new)
  - `src/components/crypto/CryptoTradingPanel.tsx` — error surfacing
  - `src/pages/ExchangePage.tsx` — error surfacing
  - `supabase/functions/crypto-trading/index.ts` and `supabase/functions/fx-engine/index.ts` — only if smoke test reveals bugs
- **Dependencies:** `qrcode.react`
- **DB:** no schema changes. Possibly one pg_cron insert for FX refresh.
- **Out of scope for Phase 1:** Phase 2 (Cards persistence, Send funding sources → bank_accounts) and Phase 3 (Quick Actions, notifications, profile pages). The doc itself queues those.

### Verification

- Deploy edge functions, run `curl_edge_functions` against each action, inspect logs.
- Open `/exchange`, perform a small USD→CAD swap, confirm balances move and a journal entry is recorded.
- Open `/wallets`, click new Receive button, verify QR + account number render and copy works.
