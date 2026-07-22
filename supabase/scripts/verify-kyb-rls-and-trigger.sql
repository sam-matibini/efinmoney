-- Verifies the things that must not regress on the KYB module:
--   (a) the RLS boundary -- business A must be invisible to business B's owner;
--   (b) the approval trigger -- a business cannot reach 'approved' while any
--       required document is missing or unapproved;
--   (c) every status transition lands on the audit trail;
--   (d) submission screens the business and its owners against aml_watchlist,
--       and an unresolved hit blocks approval;
--   (e) a declared PEP blocks approval until signed off individually;
--   (f) limit resolution picks business limits for an approved business owner
--       and individual limits for everyone else.
--
-- Note: (d) forces a synthetic hit rather than relying on a real watchlist
-- match, so the test does not depend on aml_watchlist contents.
--
-- Run in Supabase Dashboard -> SQL Editor -> New query -> paste -> Run, AFTER
-- the KYB migrations (20260722120000, 20260722121000) have been applied.
-- Prefer a branch or staging database. Read the caveats below before running
-- it against production.
--
-- Deliberately NOT a migration: it needs rows in auth.users (business_profiles
-- .owner_user_id has an FK to it), and inserting there fires
-- on_auth_user_created -> handle_new_user, which provisions profiles, wallets,
-- user_roles and risk tiers, and queues a welcome email through pg_net. None of
-- that may survive on a live database, and it is not something that should fire
-- automatically on every `supabase db push`.
--
-- Two mitigations, and one caveat:
--
--   * The whole body runs inside an inner block with an EXCEPTION handler,
--     making it a subtransaction. The sentinel raised at the end unwinds every
--     write above it -- the auth.users rows, everything handle_new_user
--     created, and the queued pg_net request. A genuine check failure still
--     propagates and aborts with a readable message.
--
--   * Success is reported via RAISE NOTICE, so check the output: a silent run
--     means the notices were suppressed, not that the checks were skipped.
--
--   * CAVEAT: the auth.users INSERT below lists the columns required by the
--     auth schema at time of writing. If Supabase has since added a NOT NULL
--     column, this aborts on the INSERT before any check runs. That is a false
--     negative on the script, not a fault in the KYB schema -- add the column
--     and re-run.
--
-- This exercises the policy predicate functions directly. It cannot exercise
-- RLS enforcement itself, because SQL Editor and migrations both run with
-- privileges that bypass RLS. To test enforcement end to end, sign in as two
-- separate non-staff users and confirm neither sees the other's business.

DO $outer$
DECLARE
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_biz_a uuid;
  v_biz_b uuid;
  v_visible bigint;
  v_status kyb_status;
  v_scope text;
  v_blocked boolean := false;
  r RECORD;
BEGIN
 BEGIN   -- subtransaction: everything below is unwound before this migration commits

  -- Isolated identities for the fixtures.
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES
    (v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'kyb-verify-a@example.invalid', '', now(), now(), now()),
    (v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'kyb-verify-b@example.invalid', '', now(), now(), now());

  INSERT INTO public.business_profiles
    (owner_user_id, legal_name, entity_type, incorporation_country, registration_number, kyb_status)
  VALUES
    (v_user_a, 'Verify Co A', 'corporation', 'CA', 'A-0001', 'in_progress')
  RETURNING id INTO v_biz_a;

  INSERT INTO public.business_profiles
    (owner_user_id, legal_name, entity_type, incorporation_country, registration_number, kyb_status)
  VALUES
    (v_user_b, 'Verify Co B', 'corporation', 'CA', 'B-0001', 'in_progress')
  RETURNING id INTO v_biz_b;

  -- ---------- (a) RLS boundary ----------
  -- owns_business() is what every business_* policy delegates to, so testing it
  -- directly tests the boundary without needing to impersonate a JWT.
  IF public.owns_business(v_user_b, v_biz_a) THEN
    RAISE EXCEPTION 'RLS BOUNDARY FAILED: user B is treated as owner of business A';
  END IF;
  IF NOT public.owns_business(v_user_a, v_biz_a) THEN
    RAISE EXCEPTION 'RLS BOUNDARY FAILED: user A is not treated as owner of business A';
  END IF;
  RAISE NOTICE 'OK  (a) owns_business isolates business A from user B';

  -- The SELECT policy predicate itself, evaluated as user B would see it.
  SELECT count(*) INTO v_visible
    FROM public.business_profiles
   WHERE (owner_user_id = v_user_b OR public.is_kyb_reviewer(v_user_b));
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'RLS BOUNDARY FAILED: user B can see % business rows, expected exactly 1', v_visible;
  END IF;
  RAISE NOTICE 'OK  (a) user B sees exactly its own business row';

  -- ---------- (b) approval trigger ----------
  -- No documents uploaded yet, so approval must be refused.
  BEGIN
    UPDATE public.business_profiles SET kyb_status = 'approved' WHERE id = v_biz_a;
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'TRIGGER FAILED: business approved with zero required documents';
  END IF;
  RAISE NOTICE 'OK  (b) approval blocked while required documents are missing';

  -- Supply every required CA business document, but leave them pending.
  FOR r IN
    SELECT document_type FROM public.kyb_document_requirements
     WHERE country = 'CA' AND is_required AND enabled AND applies_to = 'business'
       AND (entity_type IS NULL OR entity_type = 'corporation')
  LOOP
    INSERT INTO public.business_documents
      (business_profile_id, document_type, file_name, file_path, status)
    VALUES
      (v_biz_a, r.document_type, r.document_type || '.pdf',
       v_user_a::text || '/' || v_biz_a::text || '/' || r.document_type || '.pdf', 'pending');
  END LOOP;

  v_blocked := false;
  BEGIN
    UPDATE public.business_profiles SET kyb_status = 'approved' WHERE id = v_biz_a;
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'TRIGGER FAILED: business approved while its documents were still pending';
  END IF;
  RAISE NOTICE 'OK  (b) approval blocked while required documents are pending';

  -- Approve the documents; the entity may now be approved and must land on kyb_1.
  UPDATE public.business_documents SET status = 'approved' WHERE business_profile_id = v_biz_a;
  UPDATE public.business_profiles SET kyb_status = 'approved' WHERE id = v_biz_a;

  SELECT kyb_status INTO v_status FROM public.business_profiles WHERE id = v_biz_a;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'TRIGGER FAILED: expected approved, got %', v_status;
  END IF;

  PERFORM 1 FROM public.business_profiles
   WHERE id = v_biz_a AND kyb_tier = 'kyb_1' AND approved_at IS NOT NULL
     AND current_step = 'completed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRIGGER FAILED: approval did not set kyb_tier/approved_at/current_step';
  END IF;
  RAISE NOTICE 'OK  (b) approval grants kyb_1 and stamps approved_at';

  -- Suspension must drop the entity back to zero limits.
  UPDATE public.business_profiles SET kyb_status = 'suspended' WHERE id = v_biz_a;
  PERFORM 1 FROM public.business_profiles WHERE id = v_biz_a AND kyb_tier = 'kyb_0';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRIGGER FAILED: suspension did not reset kyb_tier to kyb_0';
  END IF;
  RAISE NOTICE 'OK  (b) suspension resets the tier to kyb_0';

  -- Every transition should be on the audit trail: in_progress -> approved -> suspended.
  SELECT count(*) INTO v_visible
    FROM public.business_kyb_audit_log WHERE business_profile_id = v_biz_a;
  IF v_visible < 2 THEN
    RAISE EXCEPTION 'AUDIT FAILED: expected at least 2 audit rows, found %', v_visible;
  END IF;
  RAISE NOTICE 'OK  (c) % audit row(s) recorded', v_visible;

  -- ---------- (d) sanctions screening ----------
  -- Reset to in_progress, then submit: the AFTER trigger must screen the
  -- business name plus every declared owner.
  UPDATE public.business_profiles SET kyb_status = 'in_progress' WHERE id = v_biz_a;
  UPDATE public.business_profiles SET kyb_status = 'pending_review' WHERE id = v_biz_a;

  SELECT count(*) INTO v_visible
    FROM public.aml_screenings WHERE trigger = 'kyb' AND trigger_ref = v_biz_a;
  IF v_visible < 2 THEN
    RAISE EXCEPTION
      'SCREENING FAILED: expected >=2 screening rows (business + owner), found %', v_visible;
  END IF;
  RAISE NOTICE 'OK  (d) screening produced % subject row(s)', v_visible;

  -- Force an unresolved hit and confirm approval is refused.
  UPDATE public.aml_screenings
     SET status = 'hit', match_count = 1, screened_by = NULL
   WHERE trigger = 'kyb' AND trigger_ref = v_biz_a
     AND subject_name = 'Verify Co A';

  v_blocked := false;
  BEGIN
    UPDATE public.business_profiles SET kyb_status = 'approved' WHERE id = v_biz_a;
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'SCREENING FAILED: business approved with an unresolved sanctions hit';
  END IF;
  RAISE NOTICE 'OK  (d) approval blocked by unresolved sanctions hit';

  -- Resolving it (stamping screened_by) must unblock approval.
  UPDATE public.aml_screenings
     SET screened_by = v_user_a, status = 'clear'
   WHERE trigger = 'kyb' AND trigger_ref = v_biz_a;

  -- ---------- (e) PEP sign-off ----------
  INSERT INTO public.business_owners
    (business_profile_id, full_name, role, ownership_percent, is_pep, verification_status)
  VALUES
    (v_biz_a, 'Verify Pep Person', 'director', 0, true, 'pending');

  v_blocked := false;
  BEGIN
    UPDATE public.business_profiles SET kyb_status = 'approved' WHERE id = v_biz_a;
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'PEP FAILED: business approved with an unsigned-off PEP';
  END IF;
  RAISE NOTICE 'OK  (e) approval blocked by PEP awaiting sign-off';

  UPDATE public.business_owners
     SET verification_status = 'approved'
   WHERE business_profile_id = v_biz_a AND is_pep;

  UPDATE public.business_profiles SET kyb_status = 'approved' WHERE id = v_biz_a;
  SELECT kyb_status INTO v_status FROM public.business_profiles WHERE id = v_biz_a;
  IF v_status <> 'approved' THEN
    RAISE EXCEPTION 'PEP FAILED: approval still refused after sign-off, got %', v_status;
  END IF;
  RAISE NOTICE 'OK  (e) approval proceeds once hits are reviewed and PEPs signed off';

  -- ---------- (f) limit resolution ----------
  -- Owner A now has an approved business, so business limits must win.
  SELECT scope INTO v_scope FROM public.resolve_transaction_limits(v_user_a);
  IF v_scope IS DISTINCT FROM 'business' THEN
    RAISE EXCEPTION 'LIMITS FAILED: expected business scope for an approved owner, got %',
      COALESCE(v_scope, 'null');
  END IF;
  RAISE NOTICE 'OK  (f) approved business owner resolves to business limits';

  -- Owner B has no approved business, so their individual tier applies.
  SELECT scope INTO v_scope FROM public.resolve_transaction_limits(v_user_b);
  IF v_scope IS DISTINCT FROM 'individual' THEN
    RAISE EXCEPTION 'LIMITS FAILED: expected individual scope for user B, got %',
      COALESCE(v_scope, 'null');
  END IF;
  RAISE NOTICE 'OK  (f) non-business user resolves to individual limits';

  -- All checks passed. Unwind the subtransaction so none of the fixtures --
  -- nor anything handle_new_user provisioned for them -- reaches the commit.
  RAISE EXCEPTION 'KYB_VERIFY_ROLLBACK';

 EXCEPTION
   WHEN OTHERS THEN
     IF SQLERRM = 'KYB_VERIFY_ROLLBACK' THEN
       RAISE NOTICE 'KYB verification passed; all fixtures rolled back.';
     ELSE
       -- A real failure: re-raise so the migration aborts.
       RAISE;
     END IF;
 END;
END $outer$;
