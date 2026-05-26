## Audit results

Frontend: clean. No runtime errors, no console errors, no broken routes (the `/onboarding/address` bug was fixed earlier).

Backend security scan surfaced **4 real issues** that need fixing, plus a long tail of low-severity linter advisories.

---

## Critical (must fix)

**1. Clients can write directly to the double-entry ledger** — ERROR
The `ledger_entries` INSERT policy currently lets any authenticated user insert rows as long as `wallet_id` belongs to them. This bypasses the `execute_fx_swap` / transfer SECURITY DEFINER functions and allows fabricated, unbalanced journal entries (credit without matching debit). Fix: remove the wallet-ownership branch from the INSERT policy; only `finance` / `admin` roles may insert directly, all user-initiated writes flow through the designated SECURITY DEFINER functions.

**2. Users can modify their own transfer records after submission** — ERROR
The `Users can update own transfers` policy applies to ALL columns with only `auth.uid() = sender_id`. A user can mutate `status`, `failure_reason`, `recipient_account`, `recipient_name`, `payout_method`, `interac_security_question`, etc. — tampering with compliance records and the outcome of a transfer. Fix: drop this policy and route status/recipient changes through SECURITY DEFINER functions. (Optional: re-add a narrow column-level UPDATE for a `user_note` field only.)

---

## High priority

**3. Broken member-visibility RLS on `business_card_programs`** — WARN
Policy contains `WHERE m.program_id = m.id` (compares two columns of the same alias) — always false, so members are silently denied access to their own programs. Fix: change to `m.program_id = business_card_programs.id`.

**4. Realtime channel subscriptions are not authorized** — WARN
`transfers` and `kyc_verifications` are published to Realtime but `realtime.messages` has no RLS policy, so any signed-in user can subscribe to any channel topic and observe events. Fix: add RLS on `realtime.messages` scoping topics to `auth.uid()` or staff roles.

---

## Low priority (acknowledge, don't auto-fix)

- ~49 linter warnings about SECURITY DEFINER functions being executable by anon/authenticated, `function_search_path_mutable`, `extension_in_public`, `rls_enabled_no_policy`. These are mostly by-design (RPCs that must be callable) but warrant a one-pass review to lock down anything not intentionally exposed and to add `SET search_path = public` where missing. Not blocking.

---

## Implementation plan (migration only — no frontend changes)

Single migration file that:

1. Drops the unsafe `ledger_entries` INSERT policy and recreates it scoped to `has_role(auth.uid(), 'finance')` / `'admin'` (or to `service_role` only).
2. Drops `Users can update own transfers`; if we want to keep a client-editable `user_note`, re-add a column-restricted policy via `GRANT UPDATE (user_note)`.
3. Replaces the broken `business_card_programs` member SELECT policy with the corrected subquery.
4. Adds `realtime.messages` SELECT policy restricting topic subscriptions to `auth.uid()`-scoped names plus staff roles.
5. Adds `SET search_path = public` to any of our SECURITY DEFINER functions still missing it (sampling pass, not all 40+ warnings).

No frontend code touches required — these are all DB-side. Existing edge functions already use `service_role` so they keep working after the policy tightening.

I'll write the migration and verify with the linter after apply.
