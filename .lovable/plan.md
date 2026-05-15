## Problem

The transfer tracking page shows "Processing Payout" as failed with the message:
> "This payout corridor is not yet enabled on our payments provider. Your funds have been returned to your wallet. Please try again later or contact support."

This is the friendly message we already map for Paysafe error **PAYMENTHUB-1** ("submitted payment type and currency code combination is not supported for your account"). It is returned because the Paysafe **test** account behind `PAYSAFE_API_KEY` does not have **INTERAC_ETRANSFER Standalone Credit (payouts) for CAD** enabled on its Payment Hub profile.

The code path is working correctly:
1. Wallet was debited
2. `paysafe-payout` called `/paymenthub/v1/paymenthandles` with `paymentType: INTERAC_ETRANSFER` + `currencyCode: CAD`
3. Paysafe rejected with `PAYMENTHUB-1`
4. We caught it, refunded the wallet, marked the transfer `failed`, and stored the friendly reason — exactly what the timeline shows.

So this is **not a code bug**. It is a Paysafe merchant-account provisioning issue. No code change will make the payout succeed until Paysafe enables the corridor on the account.

## What needs to happen (Paysafe side — only the user can do this)

In the Paysafe Business Portal (or by emailing Paysafe support / your account manager), request the following on the account whose API key is in `PAYSAFE_API_KEY`:

1. **Interac e-Transfer — Standalone Credit (payouts) for CAD** must be enabled on the Payment Hub.
2. If EFT payouts are also expected: **EFT — Standalone Credit for CAD**.
3. Confirm `PAYMENTHUB` scope (not just legacy Alternate Payments / Direct Debit) is on the API key.
4. Because `PAYSAFE_ENV=test`, the enablement must exist on the **sandbox** profile — not just live.

Once Paysafe confirms enablement, retry a small CAD→CAD Interac transfer. Expected:
- Payment-handle response: `status: PAYABLE`
- Standalone-credit response: `id` with `status: PROCESSING`
- Tracking page advances `Processing Payout → Delivered to Recipient` once the `SA_CREDIT_*` webhook arrives.

## Code changes

**None required.** The error handling, wallet refund, transfer status, and friendly user-facing message are already in place and working as designed (visible in your screenshot).

If Paysafe says the corridor *is* enabled and the same error still occurs, the next step is to inspect the raw Paysafe response in the `paysafe-payout` edge function logs and share it with Paysafe support — not to change code.

## Workaround options (if you want users to be able to send CAD now, before Paysafe enables the corridor)

These are optional and only worth doing if you need a working payout path immediately:

1. **Hide Interac as a payout option for CAD** in the Canada send flow until Paysafe enablement is confirmed, so users don't initiate transfers that will fail. (Frontend-only change in `src/components/send/CanadaSendFlow.tsx`.)
2. **Switch to a different Paysafe API key** that already has the Interac payout corridor enabled (set in `PAYSAFE_API_KEY` secret).

Tell me if you want either of these and I'll plan that change. Otherwise, the only action is on Paysafe's side.
