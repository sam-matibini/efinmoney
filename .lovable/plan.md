
## Goal
Add **Circle Payments Network (CPN)** as a new payout rail for cross-border transfers. The platform sends USDC on-chain to Circle's network; Circle's counterparty originator pays out local fiat to the recipient's bank account. We keep our existing ledger model: the user's wallet is debited, a settlement account tracks in-flight USDC, and a final fee/spread is booked on completion.

## Why CPN (not Mint or Programmable Wallets)
- You already have a Stellar treasury + USDC plumbing (`execute-crypto-swap`, `stellar-network.ts`, `STELLAR_TREASURY_SEED`). CPN reuses it: we sign USDC transfers from treasury to Circle's deposit address.
- Fits cleanly next to PawaPay (Africa mobile money), Paysafe (CA Interac/EFT), Stripe Visa Direct (CA debit) — CPN handles **bank payouts in corridors those rails don't cover well** (LatAm, parts of Asia, EU SEPA, MENA).
- No custody change for users, no rewrite of wallets.

## Production guardrails
- All Circle keys go through `secrets` (never in code). Add: `CIRCLE_API_KEY`, `CIRCLE_ENV=production`, `CIRCLE_WEBHOOK_PUBLIC_KEY` (or notification subscription ARN secret), `CIRCLE_CPN_ORIGINATOR_ID`, `CIRCLE_USDC_DEPOSIT_ADDRESS` (Circle-issued Stellar deposit address for our originator).
- Production = mainnet. We'll verify `STELLAR_NETWORK=MAINNET` and that `STELLAR_TREASURY_SEED` holds enough USDC + XLM reserves before each send.
- Idempotency keys on every Circle API call (UUID per transfer attempt) — stored on the transfer row to safely retry.
- Webhook signature verification mandatory; reject unsigned events.

## Architecture

```text
User /send (CPN corridor)
        │
        ▼
 create-cpn-quote ─► Circle quote API (rate + fees + ETA)
        │
        ▼
 User confirms ──► initiate-cpn-payout (edge fn)
        │           1. Lock funds: debit user wallet (ledger)
        │           2. Credit 1207-CPN settlement (USDC in-flight)
        │           3. Send USDC from treasury → Circle deposit addr (Stellar)
        │           4. POST /v1/cpn/transfers to Circle (idempotency key)
        │           5. Persist circle_transfer_id on transfer row
        ▼
 cpn-webhook  ◄── Circle notifications
        │     payout.processing | payout.completed | payout.failed | payout.returned
        ▼
 - completed → debit 1207-CPN, credit FX income (spread), mark transfer completed
 - failed/returned → reverse ledger, refund user wallet, notify
```

## Database changes (one migration)
- New ledger account `1208 — Circle CPN Settlement (USDC)` (asset).
- New enum value `'circle_cpn'` on `payout_provider` (or equivalent) — confirm during build by reading the `transfers` schema.
- Add columns to `transfers`:
  - `circle_transfer_id text`, `circle_quote_id text`, `circle_status text`, `circle_idempotency_key uuid`, `circle_payload jsonb`.
- New table `cpn_corridors` (admin-managed): `id, source_currency, dest_country, dest_currency, payout_method (bank|wallet), enabled, min_amount, max_amount, est_minutes, markup_bps`. RLS: read for `authenticated`, write for `admin`. Seeded with the corridors Circle supports in production.
- Indexes: `transfers(circle_transfer_id)`, `transfers(circle_status)`.

## Edge functions (new)
1. `circle-quote` — GET corridor + amount → returns rate, fees, ETA. Auth required. Rate-limited via `check_rate_limit`.
2. `initiate-cpn-payout` — POST: validates KYC tier, AML, balance; runs the ledger lock; submits Stellar USDC payment to Circle deposit address; calls Circle `POST /v1/cpn/transfers` with idempotency key; returns tracking id. Wrapped in a `BEGIN/COMMIT` style: if Circle 4xx, fully reverses ledger.
3. `cpn-webhook` (`verify_jwt = false`) — verifies Circle ECDSA signature, dedupes by event id, advances ledger + transfer state, fires notifications + receipt via existing `invoke_send_email` / `invoke_generate_receipt`.
4. `circle-reconcile` (cron-friendly) — pulls `/v1/cpn/transfers?status=...` for any local rows stuck >1h, repairs state without waiting on webhook.

## Frontend changes
- `src/lib/circle.ts` — typed client wrapper around our edge functions (no Circle keys in browser).
- `CanadaSendFlow` / `SendPage`: when the chosen destination country matches an enabled `cpn_corridors` row and PawaPay/Paysafe don't apply, surface a **"Bank deposit via Circle"** rail option with the quoted rate + ETA.
- `TransferTrackingPage`: render the four Circle stages (initiated → on-chain settled → payout processing → completed/failed).
- Admin → Settings → Integrations: new **Circle CPN** card showing connection health, originator id, supported corridors toggle.
- Operations → Provider Status: include Circle in `ProviderStatusPanel`.

## Security & compliance
- Server-side `auth.uid()` checks on `initiate-cpn-payout` (matches existing `execute_fx_swap` pattern).
- Reuse `invoke_aml_screen` trigger — already fires on transfer insert.
- Tier gating: CPN requires Tier 2+ (configurable in `tier_limits.features_enabled`).
- Webhook: verify signature, enforce 5-minute timestamp window, dedupe by Circle event id stored in new `circle_webhook_events` table.

## Rollout order
1. Migration (ledger acct + transfer columns + corridors table).
2. Seed a small set of corridors in `cpn_corridors` (you'll confirm which to enable; start with 2–3 sandbox-validated ones even though keys are prod, so we can dry-run end-to-end with small amounts).
3. Build `circle-quote` + admin Integrations panel → verifies credentials live.
4. Build `initiate-cpn-payout` + `cpn-webhook` + `circle-reconcile`.
5. Wire `SendPage` rail selection, tracking UI, ProviderStatus.
6. Smoke test with a $1 live payout in one corridor; then enable broader corridors.

## Open question for you
- **Which corridors do you want enabled first?** (e.g. USD→MXN bank, USD→PHP bank, USD→EUR SEPA, USD→BRL Pix). I'll seed `cpn_corridors` with those and leave the rest disabled. If you don't know, I'll start with USD→MXN + USD→EUR SEPA as the safest, highest-volume pair.

After you approve, I'll request any missing Circle secrets (originator id, deposit address) and start with the migration.
