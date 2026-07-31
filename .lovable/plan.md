## What I verified

- The save calls the `admin-update-user` function. A request at 10:09 UTC today returned **200** with `{"success":true,"changed":{"address_country":"CA","default_currency":"CAD"}}`, so the function is deployed and the permission/validation path works.
- The toast text in your screenshot ("Failed to send a request to the Edge Function") is Supabase's `FunctionsFetchError` — the browser never got a response. It is not a validation or permission rejection (those return a JSON error the dialog already surfaces).
- The function's `OPTIONS` handler returns only `Access-Control-Allow-Origin` and `Access-Control-Allow-Headers` — no `Access-Control-Allow-Methods` and no preflight cache — and each save currently does profile read, update, optional auth email sync, and an audit insert in one request, so a cold boot can outlast the client's patience.
- The profile-lock trigger explicitly allows admin/staff edits, so it is not the blocker.

Diagnosis: the failure is a transport-level one (cold-boot / dropped preflight), not a rejected save. Fix = make the call resilient and the error honest.

## Changes

1. `supabase/functions/admin-update-user/index.ts`
   - Complete the CORS headers: add `Access-Control-Allow-Methods: POST, OPTIONS` and `Access-Control-Max-Age: 86400`, and return `200` on preflight.
   - Move the non-critical tail work (auth email sync, audit-log insert) behind guards that never throw, so a slow/failed side-effect can't kill the response.

2. `src/components/admin-portal/EditUserDialog.tsx`
   - Route the call through a small retry wrapper: on a `FunctionsFetchError` (no HTTP response), retry once after ~800 ms — this absorbs the cold-boot case that produced your screenshot.
   - If the retry also fails to reach the function, show an actionable message ("Couldn't reach the server — check your connection and try again") instead of the raw SDK string, and keep the dialog open with the entered values intact.
   - Skip the round-trip entirely when nothing changed.

3. Verification
   - Re-deploy the function and call it directly to confirm the preflight and POST both respond.
   - Save an edit for the user in your screenshot from the preview and confirm the success toast plus the audit-trail entry.

## Technical note

No schema changes and no change to what an admin is allowed to edit — this only touches CORS/response handling on the function and error handling in the dialog.
