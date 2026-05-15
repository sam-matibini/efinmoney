# Fix inactive card fields in Canada send flow

## What I’ll change
1. Harden Stripe publishable-key loading so the send flow only mounts card Elements when a valid Stripe `pk_...` key is available.
2. Fix the Canada send form so sender card number, expiry, and CVC fields become interactive instead of rendering as dead inputs.
3. Add clearer fallback/error handling when the key is missing or invalid, so this can’t silently fail again.

## Why this is happening
- The inactive sender card fields are rendered by Stripe Elements in `src/components/send/CanadaSendFlow.tsx`.
- Those inputs only work if `src/lib/stripe.ts` successfully fetches a valid publishable key and initializes Stripe.
- Right now the flow can still render the card UI even when Stripe is not actually ready, which makes the fields appear visible but not active.
- The publishable key endpoint in `supabase/functions/stripe-payment-intent/index.ts` also returns whatever secret is stored, without validating that it is actually a Stripe publishable key.

## Implementation plan
### 1) Validate Stripe key loading at the source
- Update `supabase/functions/stripe-payment-intent/index.ts` to validate `STRIPE_PUBLISHABLE_KEY` before returning it.
- If the stored value is missing or not a Stripe publishable key, return a safe error instead of returning a bad value.

### 2) Make frontend Stripe initialization robust
- Update `src/lib/stripe.ts` to reject invalid/non-Stripe publishable keys before calling `loadStripe`.
- Improve the loader so it exposes a usable failure state instead of only returning `null` silently.

### 3) Fix the Canada sender card UX
- Update `src/components/send/CanadaSendFlow.tsx` so the sender card section only renders active Elements when Stripe is confirmed ready.
- Show a loading or configuration error state instead of dead card fields.
- Keep the existing sender/recipient dual-Elements structure, but guard it properly.

## Technical details
- Files to change:
  - `src/components/send/CanadaSendFlow.tsx`
  - `src/lib/stripe.ts`
  - `supabase/functions/stripe-payment-intent/index.ts`
- I will not change unrelated payout logic.
- If the stored Stripe publishable secret is still wrong, the UI will surface that cleanly and the key can then be rotated securely.

## Expected result
- Card number, expiry, and CVC in the Canada send flow become clickable and typable.
- The screenshot error state disappears.
- If Stripe is misconfigured again later, users will see a clear message instead of inactive fields.