## Diagnosis

The new error is from Paysafe itself, not from our code:

> The submitted payment type and currency code combination is not supported for your account (code PAYMENTHUB-1)

This is Paysafe's standard response when the merchant account does not have the requested **payment type + currency** combination enabled on the Payment Hub. In our case we sent `paymentType: INTERAC_ETRANSFER` + `currencyCode: CAD` against account `PAYSAFE_ACCOUNT_ID` in the **test** environment, and that pairing is not provisioned on the account.

The previous "URI not found" failure is now gone — the request reached the right endpoint (`/paymenthub/v1/paymenthandles`), authenticated correctly, parsed correctly, and was rejected at the account-configuration layer. So the URI fix worked; the remaining issue is purely on the Paysafe merchant account side.

## What needs to happen (Paysafe side, by the user)

This cannot be fixed in code. The user must, in the Paysafe Business Portal (or by emailing Paysafe support / their account manager), request that the following be enabled on the account whose API key we're using:

- **Interac e-Transfer — Standalone Credit (payouts)** for **CAD**
- And, if EFT payouts are also expected: **EFT — Standalone Credit** for **CAD**

In the test environment, Paysafe usually has to attach a sandbox Interac merchant profile and grant the `paymenthub` scopes for `INTERAC_ETRANSFER` payouts. Without that, every payout call returns PAYMENTHUB-1 regardless of payload shape.

Confirm with Paysafe:
1. The API key in `PAYSAFE_API_KEY` belongs to an account that has Payment Hub enabled (not only the legacy Alternate Payments / Direct Debit APIs).
2. `INTERAC_ETRANSFER` is enabled for **Standalone Credit / Payouts** (not just the Payment direction).
3. `CAD` is in the account's allowed currency list.
4. If using `PAYSAFE_ENV=test`, the same enablement exists in the **sandbox** account, not just live.

## Code changes (small, optional polish only)

While the substantive fix is on Paysafe's side, two small UI/code touches make this clearer for the user and any end-customer who sees a failed transfer:

1. **`supabase/functions/paysafe-payout/index.ts`** — when the Paysafe error code is `PAYMENTHUB-1` (or the message contains "payment type and currency code combination is not supported"), store a friendlier `failure_reason`:
   > "This payout corridor is not yet enabled on our payments provider. Your funds have been returned to your wallet. Please try again later or contact support."
   Keep the raw Paysafe message in the function logs for debugging.

2. **`src/pages/TransferTrackingPage.tsx`** — extend `friendlyFailureReason()` to map the `PAYMENTHUB-1` / "payment type and currency code combination" wording to the same friendly sentence (defensive, in case older transfers still carry the raw text).

These two edits do not unblock the actual payout — only Paysafe enabling the corridor on the account will. They just stop showing the raw Paysafe error string to end users.

## Verification

1. After the user contacts Paysafe and confirms `INTERAC_ETRANSFER` Standalone Credit + CAD is enabled on the test account, retry a small CAD→CAD Interac transfer.
2. Expected: the payment-handle call returns `status: PAYABLE`, the standalone-credit call returns an `id` with status `PROCESSING`, and the tracking page transitions to `Processing` → `Completed` once the `SA_CREDIT_*` webhook arrives.
3. If the same `PAYMENTHUB-1` error still appears, the enablement is not in place — go back to Paysafe; do not change code.

## Files touched (if you approve the polish)

- `supabase/functions/paysafe-payout/index.ts` — add `PAYMENTHUB-1` mapping in the existing `extractError()` / failure-write path.
- `src/pages/TransferTrackingPage.tsx` — extend `friendlyFailureReason()` with one extra clause.

No DB migration, no frontend behavior change, no new dependencies.
