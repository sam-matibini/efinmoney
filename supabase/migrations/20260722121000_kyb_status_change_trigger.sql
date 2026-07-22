-- Server-side KYB state machine. Mirrors on_kyc_status_change: tier assignment
-- and audit logging happen here, never from the client, so an SME cannot
-- self-approve by writing its own row.

CREATE OR REPLACE FUNCTION public.on_kyb_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_required_missing integer;
  v_new_tier kyb_tier;
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

    -- International payouts need every declared owner cleared, so those entities
    -- start at kyb_1 and are promoted to kyb_2 by a reviewer.
    v_new_tier := 'kyb_1';

    NEW.kyb_tier := v_new_tier;
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
    NEW.current_step := 'completed';
    NEW.rejection_reason := NULL;

  ELSIF NEW.kyb_status = 'pending_review' THEN
    NEW.submitted_at := COALESCE(NEW.submitted_at, now());
    NEW.current_step := 'review';

  ELSIF NEW.kyb_status IN ('rejected','suspended') THEN
    -- Losing verification drops the entity back to zero limits immediately.
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

DROP TRIGGER IF EXISTS trg_on_kyb_status_change ON public.business_profiles;
CREATE TRIGGER trg_on_kyb_status_change
  BEFORE UPDATE OF kyb_status ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.on_kyb_status_change();

-- Effective limits for a business, resolved through its tier.
CREATE OR REPLACE FUNCTION public.get_business_limits(_business_profile_id uuid)
RETURNS TABLE (
  tier kyb_tier,
  label text,
  max_balance numeric,
  daily_limit numeric,
  monthly_limit numeric,
  single_limit numeric,
  features_enabled jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.tier, l.label, l.max_balance, l.daily_limit,
         l.monthly_limit, l.single_limit, l.features_enabled
  FROM public.business_profiles b
  JOIN public.business_tier_limits l ON l.tier = b.kyb_tier
  WHERE b.id = _business_profile_id
    AND (b.owner_user_id = auth.uid() OR public.is_kyb_reviewer(auth.uid()));
$$;

GRANT EXECUTE ON FUNCTION public.get_business_limits(uuid) TO authenticated;

-- Total declared ownership, used by the wizard to block submission over 100%.
CREATE OR REPLACE FUNCTION public.business_ownership_total(_business_profile_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(sum(ownership_percent), 0)
  FROM public.business_owners
  WHERE business_profile_id = _business_profile_id
    AND role = 'beneficial_owner';
$$;

GRANT EXECUTE ON FUNCTION public.business_ownership_total(uuid) TO authenticated;
