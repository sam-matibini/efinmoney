## Problem

On `https://efin.money`, clicking **Start with Persona** shows the loading spinner briefly, then resets — no modal opens, no toast, no console error, no page reload.

The button's `onClick` only flips `loading=false` from three places:
1. The `catch` in `startVerification` (would also fire a toast — not what's happening)
2. Persona SDK `onCancel`
3. Persona SDK `onError` (also fires a toast — not what's happening)

That narrows it almost entirely to **`onCancel` firing immediately**, which on a brand-new published custom domain almost always means **Persona's hosted inquiry refuses to render because the request origin isn't on the template's allowed-domains list**.

## What to change

### 1. Add diagnostic logging to confirm the cause (1 file)

`src/components/kyc/PersonaVerification.tsx`
- Log the resolved `environment`, `inquiryId`, whether a `sessionToken` was returned, and whether `alreadySubmitted` was true — right after the edge-function response, before constructing the SDK client.
- Log a clear reason inside `onCancel` ("Persona SDK cancelled before completion — check template allowed origins for this domain") and inside `onError` (full error object).
- Show a soft toast on `onCancel` instead of silent reset, so the user gets feedback ("Verification window closed — if it didn't open, please contact support").

This is the only code change needed to make the next click self-diagnose in production. No business logic touched.

### 2. Verify Persona environment + template config (no code; secrets/dashboard check)

Confirm with the user:
- `PERSONA_ENVIRONMENT` secret = `production`
- `PERSONA_TEMPLATE_ID` is a **production** template (created in Persona's Production environment, not Sandbox)
- `PERSONA_API_KEY` is the **production** API key (matching the production template)

A mismatch (e.g. prod env + sandbox template id) would cause the inquiry creation API to error — which the edge function would return as a 502 and the client would toast. The user reports no toast, so this is the second-likeliest, not the first.

### 3. Allowed domains in Persona dashboard (user action — most likely root cause)

In Persona dashboard → **Production** environment → the inquiry template → **Hosted Flow / Embedded settings** → **Allowed origins / domains**, add:
- `https://efin.money`
- `https://www.efin.money`
- `https://efinmoney.lovable.app`
- `https://id-preview--21d3fe3a-f461-45ad-98e8-7be292ee36d7.lovable.app` (for preview testing)

After saving in Persona, re-test on `efin.money`. The SDK should now open the inquiry overlay.

## Why not change the edge function

The `create-persona-inquiry` function is already returning a sessionToken successfully (otherwise the client would throw before constructing the SDK and we'd see the toast error). The break is downstream, on the SDK side, after the function call.

## Out of scope

- No DB/schema changes
- No edge-function changes
- No changes to the Interac branch or any other KYC flow

## Verification steps after build mode

1. Publish the updated `PersonaVerification.tsx`.
2. On `https://efin.money`, open DevTools → Console, click **Start with Persona**.
3. The new console logs will identify which callback fires (`onCancel` vs `onError`) and any underlying error.
4. If `onCancel` fires with no error → confirms allowed-origins issue → add the domains in Persona dashboard (step 3 above) and retest.
