## Goal

1. Fix the 8 still-pending users — they have `verification_status='not_started'` (never started Persona), so my earlier backfill skipped them. Approve them now and assign each an eFin account number.
2. Add a quick "Open user portal" link in the admin shell so admins can hop to `/dashboard` in a new tab.

## Changes

### 1. Backfill — broader scope this time
Run an UPDATE on `kyc_verifications` for every row whose status is anything except `approved` or `rejected` (covers `not_started`, `pending`, `in_progress`, `pending_review`), setting:
- `verification_status = 'approved'`
- `id_verification_status = 'approved'`
- `liveness_check_status = 'approved'`
- `persona_decision = 'approved'`
- `reviewed_at = now()`
- `submitted_at = coalesce(submitted_at, now())`

The existing `on_kyc_status_change` trigger will then automatically:
- set `profiles.account_status = 'active'`
- set `profiles.kyc_status = 'verified'`
- set `profiles.kyc_tier = 'tier_3'`
- generate `profiles.account_number` via `generate_account_number()` (this is the eFin account number you mean)
- write the audit log + send KYC update email

Safety net: a second UPDATE on `profiles` to assign an `account_number` to any verified user who somehow still has none (defensive — the trigger should already handle it, but this guarantees the column is populated for the 8 users).

### 2. Admin shell — "Open user portal" link
In `src/components/admin-portal/AdminLayout.tsx`, add one button in the topbar (between the bell and the theme toggle) that opens `/dashboard` in a new tab:
```tsx
<Button variant="outline" size="sm" onClick={() => window.open("/dashboard", "_blank")}>
  <ExternalLink className="w-4 h-4 mr-2" /> User portal
</Button>
```
Also add the same item to the avatar dropdown for mobile.

No other UI or backend changes. The admin can already sign in with their own customer account in that new tab if needed (covered in last turn's recommendation — separate browser session if they want true isolation).

## Verification

1. Reload `/admin/users` → all 8 listed users should show `active` / `verified` / `tier_3` with an account number column populated.
2. Topbar shows a new "User portal" button that opens `/dashboard` in a new tab.