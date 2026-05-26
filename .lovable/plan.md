## Goal

Any user who completes Persona ID + selfie verification is **auto-approved** (kyc_status=verified, account_status=active, kyc_tier=tier_3) — no manual admin review. Also backfill the 8 users currently stuck on "pending verification".

## What already exists

- `on_kyc_status_change` trigger already promotes a user to Tier 3 + active when `kyc_verifications.verification_status` flips to `approved` AND `id_verification_status = 'approved'`.
- `persona-webhook` edge function receives Persona events.
- `persona-self-approve` edge function exists for the user-driven self-approval flow.

The gap: the Persona webhook (and/or self-approve path) is setting `id_verification_status='approved'` but **not** flipping `verification_status` to `approved` in the same write, so the trigger never fires. The 8 pending users are evidence.

## Changes

### 1. Backfill the 8 pending users (data fix, one-time)
Run an UPDATE on `kyc_verifications` for every row where `verification_status = 'pending'`, setting:
- `verification_status = 'approved'`
- `id_verification_status = 'approved'`
- `selfie_verification_status = 'approved'`
- `reviewed_at = now()`

This triggers `on_kyc_status_change`, which automatically:
- promotes to `tier_3`
- sets `profiles.account_status = 'active'`
- sets `profiles.kyc_status = 'verified'`
- generates account number if missing
- writes an audit log row
- sends the `kyc_update` email

### 2. Fix `persona-webhook` for future verifications
On any Persona event where the inquiry status is `approved` / `completed` / `passed`, the function must write **both** fields in a single update:
```
verification_status: 'approved'
id_verification_status: 'approved'
selfie_verification_status: 'approved'  (if selfie collected)
reviewed_at: now()
```
That single write fires the existing trigger and the rest is automatic. No manual admin step.

### 3. Mirror the same logic in `persona-self-approve`
The self-approve path (called from the client after Persona returns success) must do the same combined update so the trigger fires immediately and the UI updates without a refresh.

### 4. UI confirmation
No component changes needed — `AdminUsers` and `UserDetail` already read `profiles.account_status` and `kyc_status`, so once the trigger flips them the table re-renders correctly on next fetch. We'll just verify after the backfill.

## Out of scope

- No changes to RLS, no new tables, no compliance/AML loosening.
- We are NOT auto-approving users who haven't actually been through Persona going forward — only the existing 8 stuck rows get the one-time backfill (per your confirmation).

## Verification

1. After backfill: query `profiles` for the 8 emails → all should show `kyc_status=verified`, `account_status=active`, `kyc_tier=tier_3`, and have an `account_number`.
2. Reload `/admin/users` → status badges flip from "pending verification" to "active".
3. End-to-end: a fresh test user runs Persona → webhook fires → user lands on dashboard already Tier 3.