## Diagnose: 4 real-user Persona cases with no reference ID

These are not test data — they were your real KYC attempts, but Persona never received our `referenceId` to link them to your profile. Before resolving them in Persona, we need to confirm your actual KYC state in our DB and fix the SDK linkage so it doesn't happen again.

## Step 1 — Check current DB state for your account

Run a read-only query against `profiles` + `kyc_verifications` for the currently logged-in user (Samuel) to determine:
- `profiles.kyc_status` and `profiles.kyc_tier` right now
- All rows in `kyc_verifications` for this user_id, including `verification_status`, `persona_inquiry_id`, `submitted_at`
- Whether the most recent inquiry has a linked Persona inquiry ID at all

This tells us whether you're already Tier 3 (cases are duplicates), still pending (need manual approval), or completely unlinked (SDK bug still live).

## Step 2 — Act based on what we find

**If you're already approved/Tier 3:**
- These 4 cases are leftover orphans. Close them in Persona as "Duplicate" or "Other → resolved out of band". No app changes needed.

**If you're still pending/Tier 0:**
- Manually approve you via the admin KYC review screen (or a direct one-shot update if no `kyc_verifications` row exists). This triggers the `on_kyc_status_change` trigger and flips you to Tier 3.
- Then close the 4 Persona cases as "Duplicate".

**If no `kyc_verifications` row exists at all:**
- Audit `src/components/kyc/PersonaVerification.tsx` and the `create-persona-inquiry` edge function to confirm `referenceId` is being passed on every fresh inquiry creation (not just resume). The existing comment in `PersonaVerification.tsx` warns about this exact issue.
- Insert the missing verification row + approve + tier upgrade.
- Then close the cases.

## Step 3 — Prevent recurrence

Once your account is correct, briefly verify that the next fresh inquiry creates a Persona inquiry with `account_reference_id` populated. This is a one-time sanity check, not new code, as long as Step 1 doesn't reveal a code bug.

## Out of scope

- Building a UI to reconcile orphan Persona cases back to users (could come later if this happens often).
- Modifying the Persona workflow rules again — those are correct now.
