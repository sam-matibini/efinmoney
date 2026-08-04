# Fix card OTP delivery and authorization errors

## Goal
Make the card checkout follow the payment provider’s exact security sequence so the bank sends the OTP and the entered code completes the existing charge without creating a duplicate charge.

## Confirmed findings
- The checkout currently turns any unrecognized security action into an OTP prompt (`FlutterwaveCardForm.tsx:316-323, 397-405`). This can submit `authorization.type = otp` even when the provider’s current `next_action` requires another authorization type, matching the displayed “Authorization type must match charge next action” error.
- The backend derives the next UI mode mostly from `next_action.type` and discards the remaining action fields (`flw-card-charge/index.ts:239-252, 327-348`). It therefore cannot reliably preserve provider-specific authorization instructions through PIN → OTP → verification transitions.
- The OTP screen claims a code was sent based only on the inferred mode; it does not confirm that the provider actually accepted the prior action or initiated OTP delivery (`FlutterwaveCardForm.tsx:115-121`).
- Recent backend logs contain no matching invocation details, so the exact returned `next_action` shape is not currently observable.

## Implementation
1. **Preserve and normalize the provider action**
   - Parse the complete V4 `next_action` response into a small normalized contract: action type, required input, redirect URL, charge ID, and safe customer-facing message.
   - Recognize PIN, OTP, AVS/address, and redirect/3-D Secure explicitly; never default an unknown action to OTP.
   - Return a clear unsupported-action error rather than requesting the wrong credential.

2. **Advance the same charge correctly**
   - Update the existing charge only with the authorization type required by its current normalized action.
   - Keep the charge ID and expected action together in checkout state, preventing stale PIN/OTP state or a second charge request.
   - After each authorization response, render the next required step; only show the OTP form after the provider confirms OTP is the next action.

3. **Make OTP delivery status truthful and recoverable**
   - Replace the unconditional “We sent” message with provider-confirmed instructions.
   - Surface masked delivery details when supplied by the provider.
   - If supported by the returned action, add a resend action against the same charge; otherwise explain that the issuing bank controls delivery and allow retry/cancel without recharging.

4. **Add safe diagnostics**
   - Log charge ID, HTTP status, provider status, and sanitized next-action metadata in the payment function.
   - Never log card details, PIN, OTP, encryption data, or credentials.

## Verification
- Test the provider’s PIN → OTP path and confirm the OTP prompt appears only after PIN acceptance and the OTP reaches the bank-registered destination.
- Test direct OTP and 3-D Secure/redirect cards.
- Confirm an intentionally wrong OTP shows the provider error and permits retry on the same charge.
- Confirm successful verification credits the wallet exactly once and refreshes the checkout success state.
- Confirm cancel/retry clears stale authorization state and does not create or credit duplicate charges.

## Files expected to change
- `supabase/functions/_shared/flw-v4.ts`
- `supabase/functions/flw-card-charge/index.ts`
- `src/components/payments/FlutterwaveCardForm.tsx`