# Refresh Elicate + Verify Transfer Completion

## Goal
Confirm the Elicate (Zambia mobile money payout) integration is live and that a transfer initiated through the app flows all the way to `completed` (or surfaces a clean failure with ledger reversal).

## Step 1 — Refresh Elicate health
- Call `test-integrations` edge function with `{ service: "elicate" }` to re-check:
  - Mode (live vs sandbox) resolved from `ELICATE_ENV` / `ELICATE_LIVE_*` secrets
  - Endpoint reachability + auth (Bearer secret accepted)
- Report: mode, endpoint host, HTTP status, healthy/failed.

## Step 2 — Inspect recent Elicate activity
- `supabase--read_query`: last 10 ZMW transfers (`target_currency = 'ZMW'`) with `status`, `provider_reference`, `failure_reason`, `created_at`, `completed_at`.
- `supabase--edge_function_logs` for `elicate-payout` and `elicate-webhook` (last events) to see real upstream responses and webhook deliveries.

## Step 3 — End-to-end test transfer
- Pick (or create) a ZMW wallet with funded balance for the current preview user.
- Invoke the existing send flow via `elicate-payout` against a known test MSISDN (MTN sandbox number, e.g. `0966000001`) with a small amount (e.g. ZMW 5).
- Poll the `transfers` row until `status` ∈ {`completed`, `failed`}:
  - On `processing`: wait for `elicate-webhook` callback (verify signature with `ELICATE_LIVE_WEBHOOK_SECRET`).
  - On `failed`: confirm ledger reversal entry was written (`reference_type = 'transfer_reversal'`).
  - On `completed`: confirm `notify_transfer_completed_receipt` fired (receipt email queued) and notifications row created.

## Step 4 — Report
Single summary covering: Elicate health, raw provider response, final transfer status, ledger integrity (debits = credits, reversal if failed), webhook receipt.

## Out of scope
- No code changes unless Step 1–3 surface a defect; if they do, I'll come back with a follow-up plan before editing.
- Not touching Treasury / Stripe flows.

## Technical notes
- Functions touched (read-only): `test-integrations`, `elicate-payout`, `elicate-webhook`.
- Tables read: `transfers`, `ledger_entries`, `wallets`, `notifications`.
- Auth: test runs against the currently-previewed user; `elicate-payout` requires `x-internal-secret = SUPABASE_SERVICE_ROLE_KEY`, so the call is issued from the edge environment, not the browser.
