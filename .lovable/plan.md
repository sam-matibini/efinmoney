# Fix payment key error and reactivate sender card fields

## What I’ll change
1. Correct the backend so Stripe functions use real Stripe credentials, not the Paysafe key currently being returned to the frontend.
2. Restore the sender debit/credit card fields in the Canada send flow so the Stripe card iframe mounts and accepts input normally.
3. Validate the end-to-end card flow on `/send` so both the field activation and the saved-card charge error are resolved.

## Why this is happening
- The failing request shows `stripe-charge-saved-card` returning `Invalid API Key provided: B-qa2...`, which is not a Stripe key format.
- The frontend request for `stripe-payment-intent?action=publishable_key` is also returning `OT-1148280:B-qa2...`, so the sender card Elements provider is being initialized with the wrong secret-derived value.
- Because of that, the card iframe cannot initialize correctly and the sender card fields appear inactive.

## Implementation plan
### 1) Audit and correct Stripe key usage
- Review the Stripe-related edge functions that expose or consume Stripe credentials:
  - `supabase/functions/stripe-payment-intent/index.ts`
  - `supabase/functions/stripe-charge-saved-card/index.ts`
  - any shared Stripe setup used by sender-card funding
- Ensure each function reads the correct Stripe env vars:
  - `STRIPE_PUBLISHABLE_KEY` for the frontend publishable key response
  - `STRIPE_SECRET_KEY` for server-side Stripe API calls
- Add defensive validation so obviously invalid non-Stripe values do not get returned as a publishable key.

### 2) Verify the Canada send card-field wiring
- Check `src/components/send/CanadaSendFlow.tsx` and `src/lib/stripe.ts` together.
- Keep the current dual-Elements structure if valid, but make sure the sender funding card fields only render once Stripe is actually ready.
- Improve the loading/fallback behavior so the form does not show dead card inputs when the key is missing or invalid.

### 3) Validate the exact user flow
- Confirm the publishable-key endpoint now returns a proper Stripe `pk_...` key.
- Confirm the sender card number / expiry / CVC fields become focusable and typable on `/send`.
- Confirm the saved-card charge path no longer throws the `Invalid API key provided` error.

## Technical details
- Root cause appears to be configuration, but I’ll also harden the code so a bad secret cannot silently break the UI again.
- If the stored Stripe secrets themselves are wrong, I’ll prompt for a secure secret update after the code-side safeguards are in place.
- No unrelated payment-provider changes will be made in this pass.

## Expected result
- The error shown in your screenshot disappears.
- Sender debit/credit card fields become active and usable.
- Stripe funding requests use the correct Stripe credentials end-to-end.