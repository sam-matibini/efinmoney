# Fix card checkout: security check never appears

## What's wrong

When Flutterwave asks for extra authentication (OTP, PIN, or 3-D Secure), the checkout goes into an "auth" state, but the full-screen "Verifying your identity… Please complete the security check" overlay is drawn on top of the form. That overlay blocks the very inputs you need to complete the check, so the payment just sits there — exactly what the screenshot shows.

Three concrete defects in `src/components/payments/FlutterwaveCardForm.tsx`:

1. The processing overlay renders for every non-idle stage, including `auth`. It covers the PIN entry box.
2. Only `pin` mode has a form. Flutterwave commonly returns `otp` (and `avs_noauth`), which the backend already passes through as `auth.mode`, but the UI renders nothing for those modes — so there's no way to enter the code.
3. After a 3-D Secure redirect popup closes, the code re-submits the original charge payload instead of confirming the existing charge, which can double-charge or fail.

## The fix

Frontend only, all in `FlutterwaveCardForm.tsx`:

- Show the overlay only for `charging`, `verifying` and `crediting`. During `auth`, hide it so the challenge is visible and interactive.
- Rename the single PIN form into a generic challenge panel that handles:
  - `pin` — "Enter the PIN sent by your bank"
  - `otp` — "Enter the one-time code sent to your phone/email" (sends `authorization: { mode: "otp", otp }` plus the `charge_id`)
  - `avs_noauth` — prompt for billing address/city/ZIP and resubmit
  - `redirect` — keep the popup, plus an inline "Open verification window" fallback link when pop-ups are blocked, instead of silently erroring out
- Scroll the challenge panel into view and show a clear "Action required" heading so it can't be missed.
- Keep the Pay button disabled while a challenge is pending, and let the challenge panel own the submit action.
- On popup close, confirm using the existing `charge_id` (send `charge_id` with no new card data) rather than re-posting the full card payload.
- Allow cancelling the challenge to return to an editable form.

No backend or database changes — `flw-card-charge` already returns `auth.mode`, `auth.redirect` and `charge_id` correctly.
