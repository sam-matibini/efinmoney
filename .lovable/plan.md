## Goal

PawaPay and MTN MoMo callbacks aren't live yet, so we should not hard-fail those webhook endpoints. But we also can't go back to fail-open (that was the original vulnerability). Plan: allow internal/test traffic and log unauthenticated hits, but reject anonymous external traffic by default — and the moment you set the secret, it becomes the only accepted credential.

## Changes

### `supabase/functions/pawapay-webhook/index.ts`
- Keep accepting `x-callback-secret` header or `?secret=` query param.
- If `PAWAPAY_CALLBACK_SECRET` env var **is** set → require it (current behavior, fail-closed on mismatch).
- If it is **not** set yet → accept the request but:
  - Log a clear warning: `"PAWAPAY_CALLBACK_SECRET not configured — accepting webhook without authentication"`
  - Tag the inserted webhook log row (if we have one) with `unauthenticated: true` for traceability.
- Also accept `x-internal-secret` matching `SUPABASE_SERVICE_ROLE_KEY` so our own polling/test code always works.

### `supabase/functions/mtn-momo-webhook/index.ts`
- Same pattern. Internal callers (service-role) always allowed.
- If `MTN_CALLBACK_SECRET` is set → enforce it.
- If not set → log a warning and accept the request.

### No other files touched
Other webhooks (`flutterwave-webhook`, `paysafe-webhook`) stay strictly fail-closed because those secrets are already configured (`FLW_WEBHOOK_HASH`, `PAYSAFE_WEBHOOK_SECRET` are in your secrets list).

## How to flip to fully strict later

When PawaPay and MTN go live and you have the callback URL ready, just add `PAWAPAY_CALLBACK_SECRET` / `MTN_CALLBACK_SECRET` as secrets and configure the same value in the provider dashboard / callback URL. No code change required — the existing check automatically becomes enforced.

## Security trade-off

While the secret is unset, the endpoints can be hit by anyone, but a forged call only flips a transfer status if the attacker also knows a valid `provider_reference` UUID. The warnings in the logs make it easy to spot and respond. This matches the agreed posture: "not live yet, don't break the contract; live = strict".
