## Goal
When Persona approves a user's Government ID + Selfie (Face ID), immediately grant **Tier 3** and send them into the app. No address verification required.

## Current behavior
The `on_kyc_status_change` database trigger requires BOTH `id_verification_status = 'approved'` AND `address_verification_status = 'approved'` to assign `tier_3`. With only ID approved, it falls back to `tier_2`. Since Persona's Gov ID + Selfie flow never touches `address_verification_status`, every Persona-approved user is currently capped at Tier 2.

The Persona webhook itself already sets `verification_status = 'approved'` and `id_verification_status = 'approved'` correctly on `inquiry.approved`, and the `/onboarding/pending` page already auto-routes to `/onboarding/approved` (then into the app) the moment `verification_status` flips to approved. So the only blocker is the tier logic.

## Change (single migration)

Update `public.on_kyc_status_change()` so that on approval:

- If `id_verification_status = 'approved'` → **Tier 3** (full limits + international + virtual card), regardless of address status.
- Drop the Tier 2 fallback branch entirely (no longer reachable via Persona's Gov ID + Selfie path).
- Keep account number generation, `profiles.account_status = 'active'`, `kyc_status = 'verified'`, `kyc_tier = 'tier_3'`, and the audit log insert exactly as today.

Also backfill: any existing profile with `kyc_verifications.verification_status = 'approved'` and `id_verification_status = 'approved'` currently sitting at `tier_2` gets promoted to `tier_3` (limits + features updated to match).

## Out of scope
- Persona webhook code (already correct).
- Onboarding routing (already auto-forwards on approval).
- Address verification flow (remains available for any future Tier escalation use cases, but no longer required for Tier 3).
- The 4 orphan KABC cases in Persona (decline as Duplicate, as previously agreed).
