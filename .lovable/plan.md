## Goal
The moment Persona reports ID + Selfie passed and the user clicks Submit, they land on `/dashboard` with Tier 3 visibly applied — no verification page, no spinner loop, no second click.

## Current behavior
- `onPersonaComplete` polls `get-persona-inquiry-status` up to 8× at 1.5s spacing (~12s). First successful poll navigates to `/dashboard`. Works, but feels slow because:
  1. We `await sleep(1500)` even on the first iteration before checking.
  2. We always call the edge function once per loop even when the previous `refetch()` already shows approved.
  3. The KYC realtime/poll in `useKyc` runs every 2.5s, so the UI can lag behind for ~2s after approval.
- `KYCGuard` correctly lets `in_progress + persona_inquiry_id` through, so no bounce-back.

## Changes (frontend only, no DB / edge-function changes)

### 1. `src/pages/onboarding/Identity.tsx` — tighten the poll loop
- Call `get-persona-inquiry-status` **once immediately** when `onPersonaComplete` fires (Persona returns `completed` synchronously when ID + Selfie passed at submit time, so this single call usually flips status to `approved` server-side).
- Then `await refetch()` and check `isVerified || hasPassedCoreChecks` — if true, navigate to `/dashboard` in the same tick (no sleep first).
- Only if not yet approved, enter a faster poll: up to 6 iterations at **600ms** spacing (~3.6s total) instead of 8 × 1500ms. Each iteration: invoke status sync → refetch → check.
- Keep the existing fallback toast + `/kyc` redirect if poll exhausts.

### 2. `src/pages/onboarding/Identity.tsx` — pre-warm tier query
- After successful approval, call `queryClient.invalidateQueries({ queryKey: ["risk-tier", user.id] })` and `["kyc", user.id]` before `navigate(...)` so the dashboard mounts with Tier 3 already present (no flash of Tier 1/2).

### 3. `src/hooks/useKyc.tsx` — speed up post-submit refetch
- Drop the polling interval from **2500ms → 1000ms** while `verification_status === "in_progress"` and a `persona_inquiry_id` is present. Same condition for `risk-tier`. This keeps the dashboard's tier badge in sync within ≤1s of DB trigger firing, then stops polling once approved.

### 4. Tier badge UI sanity check
- Confirm `TierBadge` / dashboard header reads from `useKyc().tier?.current_tier` (no local cache). No code change expected — just verify during implementation.

## Why this is enough
- The DB trigger `on_kyc_status_change` already upgrades the user to Tier 3 the instant `verification_status` flips to `approved`. The edge function already does that flip on the first successful status sync. So the only latency the user feels is one HTTP round-trip + one query refetch — typically <1s.
- `KYCGuard` already allows passage during the brief `in_progress` window, so even if navigation beats the DB write, the user lands on the dashboard immediately and the tier badge fills in on the next 1s tick.

## Out of scope
- No edge-function changes.
- No DB migrations.
- No Persona SDK config changes.
- No changes to `KYCGuard` (already correct).

## Files touched
- `src/pages/onboarding/Identity.tsx`
- `src/hooks/useKyc.tsx`
