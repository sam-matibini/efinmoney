## Fix: payout failing with Flutterwave 504 OriginTimeout

### Diagnosis (from edge function logs + status page)
Flutterwave's V4 `POST /transfers` endpoint (`api.flutterwave.cloud/f4bexperience`) is returning **HTTP 504 "OriginTimeout"** from Azure Front Door — the same upstream gateway flap that hit `flw-get-banks` and `flw-resolve-account` before. Their public status page lists Payouts API as "Operational" but it's clearly intermittent (status pages always lag).

The toast you're seeing ("Our payout partner is temporarily unavailable…") is our friendly error correctly firing on a real upstream 5xx. Your wallet was not charged — the existing `reverseTransferLedger` already refunds on failure.

We can't make Flutterwave's gateway healthy, but we **can stop one transient blip from killing the whole transfer** by retrying.

### Fix

**1. Retry transient 5xx in `_shared/flw-v4.ts`**
Add automatic retry inside `flwFetch` for status `502 / 503 / 504` and network errors:
- 3 attempts total, exponential backoff (500 ms → 1500 ms → 3000 ms)
- Same `X-Idempotency-Key` reused on each retry (so FLW dedupes if one secretly succeeded)
- Skip retry for 4xx and final-state responses

**2. In `flutterwave-payout/index.ts`**
- If all retries still return 502/503/504 (or the Azure HTML), keep the current refund-and-fail path but change the user notification + response message to: "Our payout partner is temporarily unavailable. We refunded your wallet — please try again in a few minutes." (less scary than `HTTP 504`).
- No queueing in DB (that path is already covered for IP-whitelisting setup errors and would need a worker for replay).

**3. Frontend** — no changes; the existing SendPage toast already maps 502/503/504/OriginTimeout to the friendly message.

### Files touched
- `supabase/functions/_shared/flw-v4.ts` — add retry loop
- `supabase/functions/flutterwave-payout/index.ts` — friendlier `reason` string when the failure is a gateway timeout

### Out of scope
- A persistent retry queue / background worker (would require a new table + cron). Happy to add as a follow-up if 504s persist beyond Flutterwave's recovery.