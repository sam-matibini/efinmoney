## Goal
After Persona ID + Face check succeeds, the user should land directly on the dashboard at Tier 3 — never on the verification page again.

## Root cause
`onPersonaComplete` calls `get-persona-inquiry-status` once. Persona's verification decisions are async, so on that first call `idPassed`/`selfiePassed` are usually still `false`. The KYC row stays `in_progress`, the code redirects to `/kyc`, and `KYCGuard` sees `in_progress` and bounces the user back to `/onboarding/identity`. That is the loop being reported.

## Changes (frontend only)

### 1. `src/pages/onboarding/Identity.tsx`
Rewrite `onPersonaComplete` to:
- Show a "Finalizing verification…" toast.
- Poll `supabase.functions.invoke("get-persona-inquiry-status", { body: { inquiryId } })` up to 8 times, ~1.5s apart (≈12s total).
- After each call, `await refetch()`. As soon as `isVerified || hasPassedCoreChecks` is true → `navigate("/dashboard", { replace: true })` and return.
- The existing edge function already flips `verification_status` to `approved` and the `on_kyc_status_change` DB trigger upgrades the user to **Tier 3** automatically — no extra work needed.
- If polling ends without approval, navigate to `/kyc` with an info toast. Never navigate back to `/onboarding/identity`.

### 2. `src/components/kyc/KYCGuard.tsx`
Add a safety net: if `kyc.persona_inquiry_id` is set AND `verification_status === "in_progress"`, allow the user through to protected routes instead of redirecting to `/onboarding/identity`. This prevents the loop even if the poll above misses the approval window (e.g. user closes the tab and comes back).

## Out of scope
- No database migrations.
- No edge-function changes (`get-persona-inquiry-status` already handles auto-approval + tier upgrade correctly).
- No changes to the Persona SDK config in `PersonaVerification.tsx`.

## Files touched
- `src/pages/onboarding/Identity.tsx`
- `src/components/kyc/KYCGuard.tsx`
