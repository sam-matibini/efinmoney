# Fix "Your bank returned an unsupported security check"

## What the screenshot shows

The CAD card charge starts, the bank asks for a security step, and the checkout stops with
"Your bank returned an unsupported security check. Please retry." The card form never gets
to show a challenge panel.

## What the code says

- `supabase/functions/flw-card-charge/index.ts` classifies the provider's `next_action` into
  four modes: `pin`, `otp`, `redirect`, `avs`. It also returns
  `code: "unsupported_auth_action"` when the type maps to none of them.
- `src/components/payments/FlutterwaveCardForm.tsx` (`applyAuthResponse`) only accepts
  `pin`, `otp`, `redirect`. Any other mode — including the `avs` the backend can legitimately
  return — falls through to the exact toast in the screenshot.

So there are two possible triggers and the current error message can't tell them apart:
an `avs` challenge the UI refuses to render, or a provider action type neither side maps.
Which one fired here is not yet confirmed — the function has no recent logs to read.

## Plan

1. Confirm the trigger first. Add the provider's `next_action` type and message to the
   response and to a console log on both the initial charge and the follow-up path, so the
   next attempt names the exact action instead of a generic phrase.

2. Support the AVS challenge end to end. The backend already detects it; the form should
   render an "Action required" panel asking for billing street, city and ZIP (pre-filled from
   what was already typed) and resubmit them as an `avs` authorization on the existing
   `charge_id`, matching the provider's `authorization.type` the same way PIN and OTP do.
   This needs a small addition in `_shared/flw-v4.ts` to send the address payload.

3. Make the failure message honest when the action really is unmapped: show the provider's
   action type and instruction text, and keep the form editable (do not reset to `idle`
   silently) so the user can retry or switch to another payment method.

## Technical notes

- Files: `src/components/payments/FlutterwaveCardForm.tsx`,
  `supabase/functions/flw-card-charge/index.ts`,
  `supabase/functions/_shared/flw-v4.ts`.
- No database or schema changes.
- No change to charge creation, amounts, fees or ledger posting.
