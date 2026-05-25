## Goal
Stop the repeated `duplicate key value violates unique constraint "kyc_verifications_user_id_key"` error in the `persona-self-approve` flow and make the approval path resilient for users whose KYC row already exists but is missing or has an out-of-sync `persona_inquiry_id`.

## What I’ll change
1. **Fix the lookup logic in `persona-self-approve`**
   - Change the function so it always resolves the caller’s existing KYC row by `user_id` first.
   - Only use `inquiryId` to enrich or validate the row, not to decide whether the row exists.
   - If multiple matching paths are possible, prefer the existing `user_id` row and update its `persona_inquiry_id` when safe.

2. **Make the function idempotent under retries**
   - Replace the current “select-then-insert” fallback with logic that cannot create a duplicate row for the same user during retries or timing races.
   - Keep existing approved/rejected guards so repeated Persona callbacks don’t break the flow.

3. **Add lightweight diagnostics in the function**
   - Add targeted logs around lookup, fallback, and update decisions so any future mismatch is visible in function logs instead of surfacing as another blind 500.

4. **Validate the fix against the deployed function path**
   - Deploy the updated edge function.
   - Test the function with the current authenticated preview session.
   - Confirm it returns success or a stable idempotent response instead of attempting a second insert.

## Expected result
- Existing users with a KYC row but no linked Persona inquiry will no longer trigger a duplicate-row insert.
- Re-running the same Persona completion flow will be safe.
- The onboarding identity page should complete instead of throwing the same backend error again.

## Technical notes
- Root cause: the function currently narrows the fetch by both `user_id` and `persona_inquiry_id`; when `persona_inquiry_id` is null or different on the existing row, the lookup misses and the fallback insert violates the unique `user_id` constraint.
- Fix strategy: treat `user_id` as the source of truth for the KYC row, and treat `persona_inquiry_id` as mutable linkage metadata.
- Scope: edge function only; no UI redesign or unrelated onboarding changes.