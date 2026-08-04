# Fix "unsupported security check" on card checkout

The card payment in the screenshot stops with: *"Your bank returned a security check we can't complete here. Please retry or use another payment method."*

That toast is raised by the front-end when the charge response comes back with an authorization step whose mode is not one of `pin`, `otp`, `redirect`, `avs`. Because the message shows no provider type in brackets, the backend sent no `provider_action_type` — so the exact step the bank asked for is currently unknown. The diagnosis is unconfirmed, and the first step is to capture it.

## Step 1 — Capture what the bank actually asked for

In `flw-card-charge`, log the complete raw `next_action` object (and the charge status/message) before any mapping, on both the initial charge and the follow-up authorization path. Today only the mapped `type` is logged, which is why the real action type is invisible. Then run one live C$ card attempt and read the function logs to identify the action name.

## Step 2 — Widen the security-check mapping

`normalizeNextAction` recognises only types containing `redirect`, `3ds`, `otp`, `pin`, `avs`/`address`, and only finds a redirect URL when it is an object (`redirect_url.url`). Extend it to also handle:

- `redirect_url` supplied as a plain string
- `payment_instruction` / `challenge` / `authorization` style names carrying a URL, treated as a redirect
- `avs_noauth`, `billing_address`, `address_verification` mapped to the AVS panel
- 3-D Secure variants such as `three_ds`, `3ds_challenge`, `secure_auth`

When a URL is present in any shape, treat the step as a redirect regardless of its type name — a hosted challenge page always works in the pop-up/redirect panel already built into the card form.

## Step 3 — Make the dead end informative and recoverable

When the action genuinely cannot be handled in-page:

- Always return `provider_action_type` and the provider's own message so the toast names the step instead of being generic.
- Offer the redirect fallback if any URL exists on the charge, rather than failing outright.
- Keep the entered card details on screen (do not reset the form) so the user can retry without re-typing.

## Step 4 — Verify

Re-run a live C$3.80 card charge on the send flow and confirm either the challenge panel renders (PIN/OTP/AVS/3-D Secure) or the toast names the exact provider action, with the raw action visible in the function logs.

## Technical notes

Files involved:

- `supabase/functions/flw-card-charge/index.ts` — raw `next_action` logging, widened normalisation, always populate `provider_action_type` and the provider message on the unsupported path.
- `supabase/functions/_shared/flw-v4.ts` — surface the redirect URL regardless of shape from `flwV4CreateCharge` / `flwV4GetCharge`.
- `src/components/payments/FlutterwaveCardForm.tsx` — keep form state on an unsupported action, show the provider action name and message, and offer "Open verification window" when a URL was returned.

No database or schema changes.
