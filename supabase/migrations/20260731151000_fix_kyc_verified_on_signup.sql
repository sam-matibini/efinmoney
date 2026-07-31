-- Fix KYC status not updating for new signups.
--
-- Root cause 1: on_kyc_status_change had `AND date_of_birth IS NOT NULL` on the
-- profile UPDATE, so any user whose DOB wasn't synced from Persona in time (or
-- whose inquiry type didn't include DOB) stayed in 'pending' permanently.
--
-- Root cause 2: enforce_verified_has_dob blocks kyc_status='verified' when DOB
-- is null — even for genuinely KYC-approved users. This is correct for manual
-- edits, but wrong when the trigger fires because Persona actually approved them.
--
-- Fix:
--   1. Relax enforce_verified_has_dob: skip the block when the user has an
--      approved kyc_verifications row (real KYC ≠ manual overreach).
--   2. Remove the `AND date_of_birth IS NOT NULL` guard from on_kyc_status_change
--      so it always writes 'verified' when KYC is approved.

-- 1. Relax the DOB guard -------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_verified_has_dob()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_kyc_approved boolean;
BEGIN
  IF NEW.kyc_status = 'verified' AND NEW.date_of_birth IS NULL THEN
    -- Allow verified if the user has a genuinely approved KYC record.
    -- This covers new signups where Persona approved but DOB wasn't synced yet,
    -- while still blocking ad-hoc manual overrides on unverified users.
    SELECT EXISTS (
      SELECT 1 FROM public.kyc_verifications
      WHERE user_id = NEW.user_id
        AND verification_status = 'approved'
    ) INTO v_kyc_approved;

    IF NOT v_kyc_approved THEN
      RAISE EXCEPTION
        'Cannot mark profile verified without date_of_birth (user_id=%, account=%)',
        NEW.user_id, NEW.account_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Remove the date_of_birth guard from on_kyc_status_change ---------------
CREATE OR REPLACE FUNCTION public.on_kyc_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acct text;
  v_has_acct text;
  v_new_tier text;
  v_framework smallint;
  v_limits public.tier_limits%ROWTYPE;
BEGIN
  IF NEW.verification_status = 'approved'
     AND (OLD.verification_status IS DISTINCT FROM NEW.verification_status) THEN

    SELECT COALESCE(kyc_framework_version, 1) INTO v_framework
      FROM public.profiles WHERE user_id = NEW.user_id;

    -- Auto-promote to tier_2 on ID approval. Tier 3 is manual-only via
    -- the approve-kyc edge function (scope='id_and_address').
    IF NEW.id_verification_status = 'approved' THEN
      v_new_tier := 'tier_2';
    END IF;

    IF v_new_tier IS NOT NULL THEN
      SELECT * INTO v_limits FROM public.tier_limits WHERE tier = v_new_tier::public.user_risk_tier;

      INSERT INTO public.user_risk_tiers (
        user_id, current_tier,
        daily_transaction_limit, monthly_transaction_limit, single_transaction_limit,
        features_enabled, upgraded_at
      )
      VALUES (
        NEW.user_id, v_new_tier::public.user_risk_tier,
        v_limits.daily_limit, v_limits.monthly_limit, v_limits.single_limit,
        v_limits.features_enabled, now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        current_tier              = EXCLUDED.current_tier,
        daily_transaction_limit   = EXCLUDED.daily_transaction_limit,
        monthly_transaction_limit = EXCLUDED.monthly_transaction_limit,
        single_transaction_limit  = EXCLUDED.single_transaction_limit,
        features_enabled          = EXCLUDED.features_enabled,
        upgraded_at               = now(),
        updated_at                = now()
      WHERE public.user_risk_tiers.current_tier < EXCLUDED.current_tier;
    END IF;

    SELECT account_number INTO v_has_acct FROM public.profiles WHERE user_id = NEW.user_id;
    IF v_has_acct IS NULL THEN
      v_acct := public.generate_account_number();
      UPDATE public.profiles
        SET account_number   = v_acct,
            account_status   = 'active',
            kyc_completed_at = now(),
            kyc_status       = 'verified',
            kyc_tier         = COALESCE(v_new_tier::public.kyc_tier, kyc_tier)
        WHERE user_id = NEW.user_id;
    ELSE
      UPDATE public.profiles
        SET account_status   = 'active',
            kyc_completed_at = COALESCE(kyc_completed_at, now()),
            kyc_status       = 'verified',
            kyc_tier         = COALESCE(v_new_tier::public.kyc_tier, kyc_tier)
        WHERE user_id = NEW.user_id;
      -- No date_of_birth guard here — enforce_verified_has_dob handles
      -- the integrity check and now allows approved KYC users through.
    END IF;

    INSERT INTO public.kyc_audit_log (kyc_verification_id, admin_id, action, previous_status, new_status, notes)
    VALUES (NEW.id,
            CASE WHEN auth.uid() IS NOT NULL AND public.is_admin_user(auth.uid()) THEN auth.uid() ELSE NULL END,
            'approved', OLD.verification_status::text, NEW.verification_status::text,
            'framework_v' || v_framework || ' → ' || COALESCE(v_new_tier, 'no_tier_change'));
  END IF;
  RETURN NEW;
END;
$$;
