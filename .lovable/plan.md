# Fix: Elicate still running in sandbox mode

## Diagnosis

All five Elicate live secrets are configured (`ELICATE_LIVE_BASE_URL`, `ELICATE_LIVE_SECRET_KEY`, `ELICATE_LIVE_PUBLIC_KEY`, `ELICATE_LIVE_WEBHOOK_SECRET`, plus `ELICATE_ENV`). But `/test-integrations` confirms the resolver is still returning `mode: "sandbox"`:

```json
{ "endpoint": "elicatepay.vercel.app", "httpStatus": 204, "mode": "sandbox" }
```

That means `ELICATE_ENV` currently holds something other than the literal string `live` (likely blank or `sandbox`). The helper at `supabase/functions/_shared/elicate.ts` only switches when the value lowercases to exactly `"live"`, so every payout still hits the sandbox URL — which is what's returning the 500 you saw in the screenshot.

## Fix

One secret update, no code changes:

1. Update `ELICATE_ENV` → set its value to `live` (lowercase, no quotes, no spaces).
2. Edge functions pick it up immediately on the next invocation — no redeploy needed.

## Verify

1. Open `/admin/diagnostics` → click **Test Connection** on Zambia (Elicate Pay). Confirm details show `mode: live` and the endpoint switches from `elicatepay.vercel.app` to your production host.
2. Run a small real payout via `/send` to a controlled MTN/Airtel number and confirm Elicate's live dashboard logs it.
3. If anything misbehaves, set `ELICATE_ENV` back to `sandbox` to revert instantly.

## What I need from you

Approve this plan and I'll trigger the secret-update form for `ELICATE_ENV`. Type `live` in the value field.
