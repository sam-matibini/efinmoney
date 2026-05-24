## Goal
Switch the Interac OIDC authorization request to use the scopes `openid general_scope` (instead of the current `openid profile address` default), then retest the flow.

## Changes

1. **`supabase/functions/interac-start/index.ts`**
   - Update the fallback default for `SCOPES` from `"openid profile address"` to `"openid general_scope"`, so the function uses the correct scope even if the `INTERAC_SCOPES` secret is not set.
   ```ts
   const SCOPES = Deno.env.get("INTERAC_SCOPES") || "openid general_scope";
   ```

2. **Update the `INTERAC_SCOPES` runtime secret** to `openid general_scope` via the secrets tool, so the deployed function uses the new value regardless of code fallback.

3. **Deploy** `interac-start` edge function.

4. **Test**
   - Call `interac-start` via `supabase--curl_edge_functions` as the logged-in preview user and confirm the returned `authorization_url` contains `scope=openid+general_scope`.
   - Then ask the user to click "Verify with Interac" on `/onboarding/identity` to validate the live redirect handshake; check `interac-start` and `interac-callback` logs for errors.

## Out of scope
- No UI changes, no DB schema changes, no callback logic changes.
