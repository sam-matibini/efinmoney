## Plan

1. Update the debit-card payout function to stop sending the unsupported recipient-only ToS agreement for Canada-to-Canada payouts.
2. Keep ToS acceptance required, but send only the acceptance timestamp and IP so Stripe applies the standard full service agreement automatically.
3. Update the claim form checkbox text and link to match Stripe’s recommended standard Services Agreement wording.
4. Validate the fix by checking the payout function response path and recent function logs for the ToS error disappearing.

## Files to change

- `supabase/functions/payment-link-claim/index.ts`
  - Remove `service_agreement: "recipient"` from `tos_acceptance`.
  - Preserve `date` and `ip` acceptance capture.
  - Leave the rest of the card-push KYC and payout flow unchanged.

- `src/pages/ClaimPaymentLinkPage.tsx`
  - Change the checkbox copy from Connected Account Agreement language to standard Stripe Services Agreement language.
  - Update the link target to Stripe’s standard services agreement page.

## Expected result

Debit-card claims should no longer fail on the ToS step for Canadian recipients, while still collecting the acceptance Stripe needs.

## Technical note

The current function explicitly sets:

```ts
service_agreement: "recipient"
```

That agreement type is not valid for this Canada-to-Canada connected account flow. Omitting it allows Stripe to use the default full agreement for the connected account, which is the recommended setup here.