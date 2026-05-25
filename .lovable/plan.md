## Goal

When Persona routes an inquiry to "Needs Review" (PEP match, watchlist match, high-risk selfie, etc.), surface it in `/admin/kyc` so the ops team can approve or reject in one click — without leaving eFinMoney or touching the Persona dashboard. Approved users instantly jump to Tier 3.

## Why this approach

Persona's auto-decisioning workflow is already correctly configured: it auto-approves clean inquiries and routes ambiguous ones (watchlist match, PEP match, high-risk selfie, Tor, behavior threat) to Needs Review. That rule is correct for a regulated fintech and should NOT be loosened. The gap is that "Needs Review" inquiries today sit in Persona's Cases UI and the user is stuck at Tier 0 indefinitely. This plan closes that gap with an in-app review queue.

## What exists today

- `/admin/kyc` page (`KycQueuePage.tsx`) — basic shell
- `/admin/kyc/:id` review page (`KycReviewPage.tsx`)
- `kyc_verifications` table with `verification_status` ('pending_review', 'approved', 'rejected'), `persona_decision`, `persona_decision_reason`, `persona_verification_data` (full webhook payload with tags)
- `kyc_audit_log` table for audit trail
- Existing approve/reject edge functions referenced in Admin CRM Portal memory
- Webhook already writes `persona_decision = 'needs_review'` and `verification_status = 'pending_review'` on `inquiry.marked-for-review` events

## What to build

### 1. Queue page (`src/pages/admin/KycQueuePage.tsx`)

Table of all KYC verifications where `verification_status = 'pending_review'`, sorted oldest first. Columns:
- User (name + email from joined `profiles`)
- Submitted at (relative time)
- Persona decision badge (`needs_review` / `pending`)
- Risk tags (chips: PEP MATCH, WATCHLIST MATCH, HIGH RISK SELFIE, TOR DETECTED, HIGH BEHAVIOR THREAT LEVEL) — extracted from `persona_verification_data.data.attributes.payload.data.attributes.tags`
- Action: "Review →" button linking to `/admin/kyc/:id`

Empty state when queue is clear. Loading skeleton. Real-time count badge in admin sidebar.

### 2. Review page (`src/pages/admin/KycReviewPage.tsx`)

For a single `kyc_verifications` row, show:
- User profile summary (name, email, phone, country, signup date)
- Persona inquiry summary: inquiry ID, status, all tags, decline reasons if any
- Risk report excerpts from `persona_verification_data` — for each tag, show the relevant report data:
  - **WATCHLIST MATCH / PEP MATCH** → matched name(s), list source, confidence score
  - **HIGH RISK SELFIE** → liveness score, selfie thumbnail link
  - **TOR DETECTED** → IP and country
  - **HIGH BEHAVIOR THREAT LEVEL** → threat score and signals
- Government ID front/back thumbnails (links to Persona-hosted secure URLs from the webhook payload)
- Action panel: two buttons
  - **Approve** (green) — opens confirm dialog with optional notes textarea
  - **Reject** (red) — opens confirm dialog requiring a reason textarea
- Audit history of prior actions on this verification from `kyc_audit_log`

### 3. Edge functions

`supabase/functions/admin-approve-kyc/index.ts`:
- Admin auth check via `AdminAuthContext` JWT
- Update `kyc_verifications`: `verification_status='approved'`, `reviewed_at=now()`, `reviewed_by=admin_id`, `admin_notes=notes`
- Update `profiles.kyc_status='approved'`, `profiles.kyc_tier='tier_3'`
- Insert into `kyc_audit_log` with `action='admin_approved'`, previous/new status, admin_id, notes
- Send approval email to user (reuse existing comms infra)

`supabase/functions/admin-reject-kyc/index.ts`:
- Same auth + audit pattern
- Update `kyc_verifications`: `verification_status='rejected'`, `rejection_reason=reason`
- Update `profiles.kyc_status='rejected'` (tier stays at `tier_0`)
- Send rejection email to user with reason

Both functions wrap DB writes in a single transaction so partial failures don't leave inconsistent state.

### 4. Permissions

Only admins with the `kyc_reviewer` or `super_admin` role (via existing `has_role()` function) can hit the queue page or call the edge functions. Reuse `AdminGuard` component.

### 5. Notifications

Add a small "Pending KYC reviews: N" badge to the admin dashboard sidebar so ops know when work is waiting. Polls `kyc_verifications` count every 30s, or subscribes via Realtime if cheap.

## Technical details

**Tag extraction helper** in `src/lib/personaTags.ts`:

```ts
export function extractRiskTags(personaData: any): string[] {
  return personaData?.data?.attributes?.payload?.data?.attributes?.tags ?? [];
}
```

**Tag-to-label map** with severity color for chips:

```text
WATCHLIST MATCH      → destructive (red)
PEP MATCH            → destructive (red)
HIGH RISK SELFIE     → warning (amber)
TOR DETECTED         → warning (amber)
HIGH BEHAVIOR THREAT → warning (amber)
```

**Audit log entries** must record before/after status and the admin user ID for SOC 2 / regulatory traceability.

**No schema changes required** — `kyc_verifications` and `kyc_audit_log` already have every column we need (`reviewed_by`, `admin_notes`, `rejection_reason`, etc. per the existing Persona KYC memory).

## Files to create/modify

```text
src/pages/admin/KycQueuePage.tsx              (rewrite)
src/pages/admin/KycReviewPage.tsx             (rewrite)
src/lib/personaTags.ts                        (new)
src/components/admin/KycRiskTagChip.tsx       (new)
src/components/admin/KycActionDialog.tsx      (new — approve/reject confirm)
src/components/admin-portal/AdminLayout.tsx   (add queue count badge)
supabase/functions/admin-approve-kyc/index.ts (new)
supabase/functions/admin-reject-kyc/index.ts  (new)
```

## Out of scope

- Changing the Persona workflow (it's correct)
- Bulk approve/reject
- Re-running Persona reports from inside eFinMoney
- Manual document re-upload by admins

## Acceptance

1. A test user whose inquiry was marked Needs Review appears in `/admin/kyc` within seconds of the webhook firing.
2. An admin clicks Approve → user's `profiles.kyc_tier` flips to `tier_3` immediately and they see Tier 3 in the app on next refresh.
3. Reject path sets `tier_0` and surfaces the reason on the user's KYC page.
4. Every action is logged in `kyc_audit_log` with admin ID and timestamps.
