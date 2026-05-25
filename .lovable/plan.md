## Problem

After the user clicks **Done** on Persona's "Congratulations" screen:

- Persona SDK fires `onComplete` with `status: "completed"` (not `"approved"`).
- The official approval only arrives later via the `persona-webhook` (often delayed or, in sandbox, never delivered).
- Until then, `kyc_verifications.verification_status = "pending_review"`, so `isVerified` / `hasPassedCoreChecks` stay false, the dashboard still shows Tier 1, and the redirect bounces back to `/kyc` → `/onboarding/identity`.

The user wants: **as soon as the two Persona checks (Government ID + Selfie/Liveness) both pass, auto-approve and show Tier 3.**

## Approach

Do the approval synchronously on the client's `onComplete` callback by calling the existing `get-persona-inquiry-status` edge function — but extend that function to inspect the inquiry's individual verifications and approve when both required checks are `passed`, without waiting for Persona's overall decision.

## Changes

### 1. `supabase/functions/get-persona-inquiry-status/index.ts`

- When fetching the inquiry, also request its `verifications` relationship:
  `GET /api/v1/inquiries/:id?include=verifications`
- Walk `included[]` and collect each `verification/*` row's `attributes.status`.
- Compute `idPassed = any government-id-type verification with status === "passed"`, `selfiePassed = any selfie/liveness verification with status === "passed"`.
- Update the existing approval branch so it triggers if **either**:
  - `liveStatus === "approved"` / `liveDecision === "approved"` (current behavior), **or**
  - `idPassed && selfiePassed` (new auto-approval rule).
- When that branch runs, set `verification_status = 'approved'`, `id_verification_status = 'approved'`, `liveness_check_status = 'approved'`, `persona_decision = 'approved'`, `reviewed_at = now()` — which is exactly what `on_kyc_status_change()` listens for to promote the user to Tier 3, activate the account, and assign an account number.
- Return the computed `idPassed` / `selfiePassed` / `approved` flags in the JSON so the client can branch with confidence.

### 2. `src/pages/onboarding/Identity.tsx` — `onPersonaComplete`

Change from "refetch and hope" to "force-sync, then refetch":

```text
1. Call supabase.functions.invoke("get-persona-inquiry-status", { body: { inquiryId } })
2. const result = await refetch()
3. If result.isVerified || result.hasPassedCoreChecks → navigate("/dashboard")
4. Else (rare — checks didn't pass) → navigate("/kyc") with toast
```

Pass the `inquiryId` received from Persona's `onComplete` into the call.

### 3. `src/components/kyc/PersonaVerification.tsx`

No behavior change needed — it already forwards `{ inquiryId, status }` to the parent's `onComplete`. Verify the type signature matches.

### 4. (Optional safety net) `persona-webhook`

Already handles `inquiry.approved` correctly and has the idempotency guard preventing downgrades, so no change needed. The webhook will simply be a no-op when it eventually arrives because the row is already approved.

## Why this is safe

- The new rule only fires when Persona itself reports both verifications as `passed` — it does not bypass any check, it just removes the wait on Persona's separate "decision" event.
- `on_kyc_status_change` trigger (already in DB) handles tier promotion, account number, and account activation atomically when `verification_status` flips to `approved`.
- Existing webhook downgrade guard (`isApproved && downgradeEvents.has(...)`) ensures a late `marked-for-review` event cannot undo the approval.

## Result

User clicks **Done** → ~1 second sync to Persona → row flips to `approved` → trigger promotes to `tier_3` → `useKyc` refetches `isVerified = true` → navigated to `/dashboard` showing **Tier 3 Verified** with no upgrade prompt.
