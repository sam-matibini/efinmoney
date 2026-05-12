## Fix: fall back to Flutterwave V3 when V4 gateway is down

### Diagnosis
Flutterwave's V4 host (`api.flutterwave.cloud/f4bexperience`, fronted by Azure Front Door) is still returning **504 OriginTimeout** for every `POST /transfers` request. The retry I added earlier (3 attempts) just makes the user wait ~5 s before showing the same friendly error. Their status page lies — Payouts API is *not* operational right now.

We can't fix Flutterwave's gateway, but we **already have the V3 secret** (`FLW_SECRET_KEY`) configured and V3 is hosted on a totally different infra (`api.flutterwave.com/v3`) that's currently healthy.

### Fix — automatic V3 fallback in `flutterwave-payout`

When V4 returns a transient gateway error after retries (status 0/408/502/503/504 or `OriginTimeout` / `Gateway Timeout` HTML body), automatically retry the same payout via V3:

```
POST https://api.flutterwave.com/v3/transfers
Authorization: Bearer ${FLW_SECRET_KEY}
{
  account_bank: "MPS",            // mobile money provider code (e.g. MPS, MTN, AIRTEL, ZAMTEL)
  account_number: "<phone>",
  amount, narration, currency,
  reference, beneficiary_name,
  callback_url, debit_currency: currency,
  meta: { network, transfer_id }
}
```

For NGN bank transfers V3 uses the same shape with `account_bank=<bank_code>` + 10-digit NUBAN.

If V3 also fails → keep current behavior (refund wallet + clear toast).
If V3 succeeds → mark transfer `processing`, store V3 `data.id` as `provider_reference`, send "Transfer initiated" notification. The existing `flutterwave-webhook` already handles V3 payloads, so completion/failure will flow through normally.

### Files touched
- `supabase/functions/flutterwave-payout/index.ts` — add `tryV3Payout(...)` helper and call it when V4 is transiently failing
- (no DB changes, no frontend changes)

### Out of scope
- Persistent retry queue / cron (only needed if both V3 and V4 are down simultaneously, which is rare)
- Removing V4 entirely — V4 is the strategic API, we just route around it during this outage

### Notes
- V3 is the legacy API but Flutterwave still actively serves it; many merchants run on it today.
- Idempotency: V3 dedupes by `reference`, and we reuse the same `EFM-{transfer_id}-{ts}` reference, so even if V4 secretly succeeded right before timing out, V3 will not double-pay (FLW rejects duplicate reference).