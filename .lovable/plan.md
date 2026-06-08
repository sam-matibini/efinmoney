## Plan

Fix the inactive debit-card inputs in the Canada send flow by simplifying the Stripe Elements setup and removing the nested recipient card mount that is likely preventing those fields from becoming interactive.

## What I’ll change

1. **Flatten the recipient card Elements wiring**
   - Remove the nested `RecipientCardSection` `<Elements>` provider.
   - Render the recipient debit-card Elements inside the existing page-level Stripe context so they initialize the same way as the sender card fields.

2. **Separate sender vs recipient field access safely**
   - Update the card tokenization flow so the recipient card uses its own mounted Stripe Element references without conflicting with the sender payment card fields.
   - Keep the current validation behavior for recipient name and card completeness.

3. **Preserve current send behavior**
   - Keep the existing Canada delivery methods, fees, and Stripe Connect flow unchanged.
   - Only touch the recipient debit-card field activation and the related tokenization path.

4. **Validate the fix in the preview**
   - Confirm the recipient card number, expiry, and CVC fields are focusable and accept input when `Instant to Card` is selected.
   - Check there are no new console/runtime errors tied to Stripe Elements.

## Technical details

- Target file: `src/components/send/CanadaSendFlow.tsx`
- Likely root cause: nested Stripe Elements providers inside the same flow causing the recipient card inputs to mount in a non-interactive state.
- Scope intentionally excludes backend, Stripe Connect status logic, and unrelated payout routing.