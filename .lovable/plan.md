## Switch Persona to Production

Persona currently runs in sandbox. To move to production we need to update credentials and confirm the environment flag.

### Steps

1. **Update secrets** (you'll be prompted to paste new values from your Persona Production dashboard):
   - `PERSONA_API_KEY` → production API key (`persona_production_...`)
   - `PERSONA_TEMPLATE_ID` → production inquiry template ID (`itmpl_...` from the Production environment)
   - `PERSONA_WEBHOOK_SECRET` → production webhook secret
   - `PERSONA_ENVIRONMENT` → set to `production`

2. **Verify webhook**: In Persona Production → Webhooks, point the endpoint to the same `persona-webhook` edge function URL and use the new webhook secret.

3. **No code changes required** — `create-persona-inquiry` already reads `PERSONA_ENVIRONMENT` and forwards it to the SDK, and all Persona calls use `PERSONA_API_KEY` / `PERSONA_TEMPLATE_ID` from env. Once secrets flip, the next inquiry will be created in production.

### Notes
- Existing sandbox inquiry IDs stored on `kyc_verifications` will become invalid in production. Users mid-flow may need to restart verification — the `resume` call will fail and `create-persona-inquiry` will create a fresh production inquiry on next attempt. If you want, I can add a one-time cleanup that nulls `persona_inquiry_id` for non-final rows so resume doesn't 404.
- Confirm the production template has the same ID + Selfie/Liveness checks so the auto-approve logic keeps working.

Proceed and I'll request the secret updates.
