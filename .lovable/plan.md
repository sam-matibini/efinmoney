## Fix: Interac kicks user back to homepage

**Root cause:** `INTERAC_REDIRECT_URI` is set to `https://www.efin.money/` (the app homepage). Interac sends the OIDC `code` there, but the homepage has no handler, so the code is never exchanged and the user appears "kicked out."

## Steps

1. **Update the `INTERAC_REDIRECT_URI` secret** to the callback edge function URL:
   ```
   https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/interac-callback
   ```
   (Done via the secrets update tool — you'll get a prompt to confirm the new value.)

2. **Verify `INTERAC_APP_RETURN_BASE`** is set to `https://efin.money` so that after the callback completes, the user lands back on `/onboarding/identity?interac=success`. If not set, I'll prompt to add/update it.

3. **Manual step on your side (Interac Hub Verify portal):** add the exact callback URL above to the allowed `redirect_uri` list for client `5f2529ac-bf0c-477c-9584-fc39b3d3f04b`. Without this, Interac will reject the request with `invalid_redirect_uri`.

4. **Retest:** call `interac-start` to confirm the authorization URL now uses the new `redirect_uri`, then ask you to click "Verify with Interac" on `/onboarding/identity`. I'll check `interac-callback` logs to confirm token exchange succeeds and the redirect ends at `/onboarding/identity?interac=success`.

## Out of scope
No code or DB changes — this is a secret + Interac portal configuration fix only.
