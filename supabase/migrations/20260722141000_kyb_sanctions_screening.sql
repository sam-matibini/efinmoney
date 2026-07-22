-- Sanctions / PEP screening for KYB.
--
-- Runs entirely in-database against public.aml_watchlist (kept current by the
-- sanctions-sync function). Deliberately NOT routed through invoke_aml_screen:
-- that function posts to a stale project ref and the aml-screen edge function
-- does not exist, so it is a silent no-op. Matching here needs no network call.
--
-- Resolution convention, reusing existing columns rather than adding new ones:
-- an aml_screenings row with status='hit' and screened_by IS NULL is UNRESOLVED.
-- A reviewer resolves it by stamping screened_by. Approval is blocked while any
-- unresolved hit remains.

-- ============== matcher ==============
-- Returns watchlist matches for one name. Exact match on the normalised name,
-- or the name appearing among the entry's normalised aliases.
CREATE OR REPLACE FUNCTION public.aml_match_name(p_name text, p_entity_type aml_entity_type)
RETURNS TABLE (watchlist_id uuid, matched_name text, source aml_source, programs text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT w.id, w.name, w.source, w.programs
  FROM public.aml_watchlist w
  WHERE public.aml_normalize_name(p_name) <> ''
    -- 'unknown' entries could be either, so never exclude them
    AND (w.entity_type = p_entity_type OR w.entity_type = 'unknown')
    AND (
      w.name_normalized = public.aml_normalize_name(p_name)
      OR EXISTS (
        SELECT 1 FROM unnest(w.aliases) a
        WHERE public.aml_normalize_name(a) = public.aml_normalize_name(p_name)
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.aml_match_name(text, aml_entity_type) TO authenticated;

-- ============== screen one business ==============
-- Screens the legal name and operating name as entities, and every declared
-- owner/director/officer as an individual. Writes one aml_screenings row per
-- subject. Returns the number of subjects that hit.
CREATE OR REPLACE FUNCTION public.screen_kyb_entity(p_business_profile_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_biz RECORD;
  v_owner RECORD;
  v_matches integer;
  v_hits integer := 0;
BEGIN
  SELECT * INTO v_biz FROM public.business_profiles WHERE id = p_business_profile_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Re-screening supersedes the previous run for this business.
  DELETE FROM public.aml_screenings
   WHERE trigger = 'kyb' AND trigger_ref = p_business_profile_id;

  -- --- the business itself ---
  SELECT count(*) INTO v_matches
    FROM public.aml_match_name(v_biz.legal_name, 'entity');

  INSERT INTO public.aml_screenings
    (user_id, trigger, trigger_ref, subject_name, subject_country, status, match_count)
  VALUES
    (v_biz.owner_user_id, 'kyb', p_business_profile_id, v_biz.legal_name,
     v_biz.incorporation_country,
     CASE WHEN v_matches > 0 THEN 'hit' ELSE 'clear' END::aml_screening_status,
     v_matches);
  IF v_matches > 0 THEN v_hits := v_hits + 1; END IF;

  -- --- operating name, when it differs ---
  IF v_biz.operating_name IS NOT NULL
     AND public.aml_normalize_name(v_biz.operating_name)
         <> public.aml_normalize_name(v_biz.legal_name) THEN
    SELECT count(*) INTO v_matches
      FROM public.aml_match_name(v_biz.operating_name, 'entity');

    INSERT INTO public.aml_screenings
      (user_id, trigger, trigger_ref, subject_name, subject_country, status, match_count)
    VALUES
      (v_biz.owner_user_id, 'kyb', p_business_profile_id, v_biz.operating_name,
       v_biz.incorporation_country,
       CASE WHEN v_matches > 0 THEN 'hit' ELSE 'clear' END::aml_screening_status,
       v_matches);
    IF v_matches > 0 THEN v_hits := v_hits + 1; END IF;
  END IF;

  -- --- every declared owner, director and officer ---
  FOR v_owner IN
    SELECT full_name, date_of_birth, nationality
      FROM public.business_owners
     WHERE business_profile_id = p_business_profile_id
  LOOP
    SELECT count(*) INTO v_matches
      FROM public.aml_match_name(v_owner.full_name, 'individual');

    INSERT INTO public.aml_screenings
      (user_id, trigger, trigger_ref, subject_name, subject_dob, subject_country,
       status, match_count)
    VALUES
      (v_biz.owner_user_id, 'kyb', p_business_profile_id, v_owner.full_name,
       v_owner.date_of_birth, v_owner.nationality,
       CASE WHEN v_matches > 0 THEN 'hit' ELSE 'clear' END::aml_screening_status,
       v_matches);
    IF v_matches > 0 THEN v_hits := v_hits + 1; END IF;
  END LOOP;

  -- Mirror the outcome onto the business so the queue can filter on it.
  UPDATE public.business_profiles
     SET aml_status = CASE WHEN v_hits > 0 THEN 'hit' ELSE 'clear' END::aml_profile_status,
         aml_last_screened_at = now(),
         risk_level = CASE WHEN v_hits > 0 THEN 'high' ELSE risk_level END
   WHERE id = p_business_profile_id;

  RETURN v_hits;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.screen_kyb_entity(uuid) TO authenticated;

-- ============== unresolved-hit count ==============
CREATE OR REPLACE FUNCTION public.kyb_unresolved_hits(p_business_profile_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::integer
  FROM public.aml_screenings
  WHERE trigger = 'kyb'
    AND trigger_ref = p_business_profile_id
    AND status = 'hit'
    AND screened_by IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.kyb_unresolved_hits(uuid) TO authenticated;

-- ============== extend the KYB state machine ==============
CREATE OR REPLACE FUNCTION public.on_kyb_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_required_missing integer;
  v_unresolved_hits integer;
  v_unapproved_peps integer;
BEGIN
  IF OLD.kyb_status IS NOT DISTINCT FROM NEW.kyb_status THEN
    RETURN NEW;
  END IF;

  IF NEW.kyb_status = 'approved' THEN
    -- Every required business document must be approved before the entity can be.
    SELECT count(*) INTO v_required_missing
    FROM public.kyb_document_requirements r
    WHERE r.enabled
      AND r.is_required
      AND r.applies_to = 'business'
      AND r.country = NEW.incorporation_country
      AND (r.entity_type IS NULL OR r.entity_type = NEW.entity_type)
      AND NOT EXISTS (
        SELECT 1 FROM public.business_documents d
        WHERE d.business_profile_id = NEW.id
          AND d.document_type = r.document_type
          AND d.status = 'approved'
      );

    IF v_required_missing > 0 THEN
      RAISE EXCEPTION
        'Cannot approve business %: % required document(s) still missing or unapproved',
        NEW.id, v_required_missing
        USING ERRCODE = 'check_violation';
    END IF;

    -- No sanctions hit may be left for a human to look at.
    v_unresolved_hits := public.kyb_unresolved_hits(NEW.id);
    IF v_unresolved_hits > 0 THEN
      RAISE EXCEPTION
        'Cannot approve business %: % unresolved sanctions hit(s) — a reviewer must clear each one first',
        NEW.id, v_unresolved_hits
        USING ERRCODE = 'check_violation';
    END IF;

    -- A self-declared PEP must be signed off individually, never bulk-approved.
    SELECT count(*) INTO v_unapproved_peps
      FROM public.business_owners
     WHERE business_profile_id = NEW.id
       AND is_pep
       AND verification_status <> 'approved';

    IF v_unapproved_peps > 0 THEN
      RAISE EXCEPTION
        'Cannot approve business %: % politically exposed person(s) still require explicit sign-off',
        NEW.id, v_unapproved_peps
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.kyb_tier := 'kyb_1';
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
    NEW.current_step := 'completed';
    NEW.rejection_reason := NULL;

  ELSIF NEW.kyb_status = 'pending_review' THEN
    NEW.submitted_at := COALESCE(NEW.submitted_at, now());
    NEW.current_step := 'review';

  ELSIF NEW.kyb_status IN ('rejected','suspended') THEN
    NEW.kyb_tier := 'kyb_0';
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
  END IF;

  INSERT INTO public.business_kyb_audit_log
    (business_profile_id, admin_id, action, previous_status, new_status, notes)
  VALUES
    (NEW.id, auth.uid(), 'status_change',
     OLD.kyb_status::text, NEW.kyb_status::text, NEW.rejection_reason);

  RETURN NEW;
END;
$function$;

-- Screening runs AFTER the row lands on pending_review, so screen_kyb_entity
-- reads committed owner rows and its UPDATE of aml_status does not fight the
-- BEFORE trigger's NEW record.
CREATE OR REPLACE FUNCTION public.after_kyb_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.kyb_status = 'pending_review'
     AND OLD.kyb_status IS DISTINCT FROM NEW.kyb_status THEN
    PERFORM public.screen_kyb_entity(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_after_kyb_submitted ON public.business_profiles;
CREATE TRIGGER trg_after_kyb_submitted
  AFTER UPDATE OF kyb_status ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.after_kyb_submitted();

-- Reviewers need to read and resolve screenings for businesses they review.
DROP POLICY IF EXISTS "aml_screenings_kyb_reviewer" ON public.aml_screenings;
CREATE POLICY "aml_screenings_kyb_reviewer" ON public.aml_screenings
  FOR ALL TO authenticated
  USING (public.is_kyb_reviewer(auth.uid()))
  WITH CHECK (public.is_kyb_reviewer(auth.uid()));
