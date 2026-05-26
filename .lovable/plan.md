# Admin can always approve in the portal

## Problem
Today the admin KYC portal (`/admin/kyc`) only shows entries with `verification_status = pending_review` and the Approve/Reject/Escalate action bar is hidden once status is `approved` or `rejected`. So when Persona or Interac auto-decides a verification, admins can no longer take action from their portal — the API outcome is final.

The user wants admins to always be able to approve in their portal, even when an API already returned a decision.

## Scope (frontend + thin edge-function tweak)

### 1. KYC Queue — surface API-decided cases
`src/pages/admin/KycQueuePage.tsx`
- Add a new "Needs admin sign-off" quick filter that returns rows where `persona_decision` is set (`approved`, `needs_review`, or `declined`) regardless of `verification_status`. Default queue still opens on `pending_review`.
- Add a small "API" column showing the Persona decision badge (auto-approved / needs review / declined / —) so reviewers see at a glance which entries were handled by the API.

### 2. KYC Review page — always allow override
`src/pages/admin/KycReviewPage.tsx`
- Remove the `!isFinal` gate on the sticky action bar. The bar always renders, but when the record is already `approved` / `rejected`, the buttons relabel to **Override approval**, **Override rejection**, **Re-request info**, and a confirmation note appears ("This will overwrite the current decision and be logged in the audit trail").
- Add an "API-approved, awaiting human sign-off" yellow banner on entries where `persona_decision = 'approved'` but `reviewed_by` is null — making it obvious the admin still owns the final call.
- Persona/Interac result card stays as-is.

### 3. Edge functions — allow override
`supabase/functions/approve-kyc/index.ts` and `reject-kyc/index.ts`
- Today both functions just `UPDATE` the row, so they technically work on already-final records. Add:
  - Accept an `override: true` flag from the client when the row is already final.
  - When `override` is true, write the audit-log `action` as `approved_override` / `rejected_override` and include the previous decision and Persona decision in `notes` for traceability.
  - Require `super_admin` or `compliance_officer` role for overrides (same roles already gate approve/reject — just enforce explicitly when override flag is set).

### 4. User detail page — manual tier approval
`src/pages/admin/UserDetailPage.tsx` (existing)
- Add a small "Manual KYC action" card with two buttons:
  - **Approve to Tier 2** / **Approve to Tier 3** — invokes `approve-kyc` against the user's latest `kyc_verifications` row (creating one if none exists via a small upsert before invoking).
  - **Revoke verification** — invokes `reject-kyc` with `scope=both` and a reason.
- This gives ops a one-click path even when the user never opened a Persona flow.

## Out of scope
- No database schema changes. `kyc_audit_log` already accepts free-text `action`, so override events fit without a migration.
- No changes to the user-facing KYC page (`src/pages/KYCPage.tsx`) or onboarding.
- No changes to Persona webhook handling — auto-approval still flows through, admin just gets the ability to override afterwards.

## Files touched
- `src/pages/admin/KycQueuePage.tsx`
- `src/pages/admin/KycReviewPage.tsx`
- `src/pages/admin/UserDetailPage.tsx`
- `supabase/functions/approve-kyc/index.ts`
- `supabase/functions/reject-kyc/index.ts`
