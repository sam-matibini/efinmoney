## Problem

Transfer `EFM-7BE6995B` failed with `failure_reason: "URI not found"`. This is the Paysafe error returned when the endpoint path doesn't exist.

`supabase/functions/paysafe-payout/index.ts` is calling legacy/wrong paths:

- Interac: `POST /alternatepayments/v1/accounts/{accountId}/etransfers`
- EFT: `POST /directdebit/v1/accounts/{accountId}/standalonecredits`

Per the current Paysafe Payments API docs (https://developer.paysafe.com/en/api-docs/payments-api/add-payment-methods/interac-e-transfer), Interac e-Transfer **payouts** (and EFT credits) must go through the **Payment Hub** as a two-step flow — there is no `accounts/{id}/etransfers` endpoint, which is why the API returns "URI not found".

## Fix

Rewrite the Paysafe payout edge function to use the correct Payment Hub two-step flow for both Interac and EFT:

### Step 1 — Create a Payment Handle
`POST {BASE}/paymenthub/v1/paymenthandles`

Interac body:
```json
{
  "merchantRefNum": "EFM-{transferId}",
  "transactionType": "STANDALONE_CREDIT",
  "paymentType": "INTERAC_ETRANSFER",
  "amount": <cents>,
  "currencyCode": "CAD",
  "interacETransfer": {
    "consumerId": "<recipient email>",
    "consumerIdType": "EMAIL",
    "recipientName": "<full name>",
    "securityQuestion": { "question": "...", "answer": "..." }   // only when not auto-deposit
  },
  "profile": { "firstName": "...", "lastName": "..." }
}
```

EFT body:
```json
{
  "merchantRefNum": "EFM-{transferId}",
  "transactionType": "STANDALONE_CREDIT",
  "paymentType": "EFT",
  "amount": <cents>,
  "currencyCode": "CAD",
  "eft": {
    "accountHolderName": "...",
    "institutionId": "...",
    "transitNumber": "...",
    "accountNumber": "...",
    "accountType": "CHECKING"
  },
  "profile": { "firstName": "...", "lastName": "..." }
}
```

Validate the response has `status === "PAYABLE"` and capture `paymentHandleToken`. If `FAILED`, mark the transfer failed with the returned error.

### Step 2 — Submit the standalone credit
`POST {BASE}/paymenthub/v1/standalonecredits`

```json
{
  "merchantRefNum": "EFM-{transferId}",
  "amount": <cents>,
  "currencyCode": "CAD",
  "paymentHandleToken": "<from step 1>"
}
```

Persist the returned `id` as `paysafe_payment_id` / `provider_reference` and set the transfer to `processing`. Existing webhook handler (`paysafe-webhook`) already consumes Paysafe events and does not need to change.

### Auth & headers
Keep the current HTTP Basic auth (`btoa(PAYSAFE_API_KEY)`). Account-id is no longer in the URL — paymenthub endpoints are account-scoped via the API key.

### Error mapping
- Bubble up `error.code` + `error.message` from Paysafe into `failure_reason` so future "URI not found"–type problems surface clearly in the tracking page.
- Refund logic stays in `cancel-transfer` / existing reversal path; on failure here we mark `status='failed'` so the existing refund flow runs (no change needed there).

### One-time DB cleanup
Mark the stuck failed transfer's `failure_reason` to a friendlier message via a small migration (the wallet wasn't debited beyond the existing reversal, so no balance fix is required — verified: status is already `failed`).

## Files touched

- `supabase/functions/paysafe-payout/index.ts` — replace endpoints + payload shape with the paymenthub two-step flow.
- (optional) `supabase/migrations/<ts>_paysafe_uri_fix_cleanup.sql` — update `failure_reason` on transfer `7be6995b-…` to the new friendly message.

No frontend changes are required — `TransferTrackingPage` already renders `failure_reason` and the `friendlyFailureReason()` helper can be left as-is.

## Verification

1. Redeploy `paysafe-payout`.
2. Trigger a small CAD→CAD Interac payout in the test environment; confirm the payment-handle call returns `PAYABLE` and the standalone-credit call returns an `id` with status `PROCESSING`.
3. Confirm the tracking page moves from `Processing` → `Completed` once Paysafe sends `SA_CREDIT_COMPLETED` to `paysafe-webhook`.
