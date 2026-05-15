# Test Plan: Canada Card-Funded Transfer (E2E + Ledger Verification)

Goal: Drive a real card-funded transfer through `/send?mode=canada`, confirm the Stripe charge succeeds, and verify the double-entry ledger posts correctly.

## Preconditions

- User must be logged in to the preview (the browser session uses their auth token).
- Stripe is in test mode — I'll use Stripe test card `4000 0008 2600 0000` (CA debit) or `4242 4242 4242 4242` as fallback. Exp: any future date, CVC: any 3 digits.
- Capture the logged-in `user_id` and a baseline snapshot of `ledger_entries` count + recent `transfers` so we can diff after the test.

## Test steps (browser automation)

1. `navigate_to_sandbox` to `/send?mode=canada`.
2. Step 1 — Amount: enter `$10.00 CAD`, funding source = **Card**, payout method = **Interac e-Transfer** (simplest payout, no recipient card needed).
3. Step 2 — Recipient: name `Test Recipient`, email `test+canada@example.com`, message `E2E ledger test`.
4. Step 2 — Sender card fields (Stripe Elements): fill number `4242 4242 4242 4242`, expiry `12/30`, CVC `123`. Confirm fields are interactive (regression check on the previous fix).
5. Submit. Wait for the success step (step 3) and capture the `transfer_id` from `lastTransferId` (visible in the receipt screen).
6. Screenshot the success page.

## Backend verification (parallel SQL via supabase--read_query)

Using the captured `transfer_id`:

a. **Transfer record**
```sql
SELECT id, status, funding_source, source_amount, fee_amount,
       source_currency, target_currency, payout_method, failure_reason
FROM transfers WHERE id = '<transfer_id>';
```
Expect `status` ∈ {`processing`, `completed`}, `funding_source = 'card'`, `failure_reason IS NULL`.

b. **Ledger entries (double-entry balance)**
```sql
SELECT la.code, la.name, le.currency_code,
       le.debit_amount, le.credit_amount, le.wallet_id, le.description
FROM ledger_entries le
JOIN ledger_accounts la ON la.id = le.account_id
WHERE le.reference_type = 'transfer' AND le.reference_id = '<transfer_id>'
ORDER BY la.code;
```
Expected rows for a $10 CAD card-funded Interac transfer with fee `F`:
- **DR 1102 Stripe Card Receivable** = `10 + F` CAD (wallet_id null)
- **CR 21xx CAD Customer Payable** (or recipient payable code mapped for CAD) = `10` CAD
- **CR 4200 Fee Revenue** = `F` CAD (only if fee > 0)

c. **Balance assertion** — sum of debits = sum of credits, all same `journal_id`:
```sql
SELECT journal_id, SUM(debit_amount) AS dr, SUM(credit_amount) AS cr
FROM ledger_entries WHERE reference_type='transfer' AND reference_id='<transfer_id>'
GROUP BY journal_id;
```
Expect `dr = cr`.

d. **Stripe charge log** — check `supabase--edge_function_logs` for `stripe-charge-card` and `execute-transfer` for the test window. Expect `success: true` from charge and no ledger insert errors.

e. **Sender wallet untouched** — card-funded transfers must NOT debit the user's CAD wallet:
```sql
SELECT COUNT(*) FROM ledger_entries
WHERE reference_id='<transfer_id>' AND wallet_id IS NOT NULL;
```
Expect `0`.

## Failure-path spot check (optional, only if main path passes quickly)

Repeat with Stripe declined card `4000 0000 0000 0002`. Expect:
- `transfers.status = 'failed'`, `failure_reason` populated.
- Zero rows in `ledger_entries` for that `transfer_id` (no ledger touched on failed charge).

## Deliverable

A short report with:
- Pass/fail per step.
- The actual ledger rows table.
- Screenshots of the send flow success page.
- Edge-function log excerpts for `stripe-charge-card` + `execute-transfer`.
- Any discrepancies between expected and actual ledger postings.

No code changes are made by this plan — it is read-only verification via the browser and Supabase read tools.
