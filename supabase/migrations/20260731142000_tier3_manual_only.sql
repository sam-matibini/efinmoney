-- Tier 3 is now manual-only: the on_kyc_status_change trigger caps at tier_2.
-- Tier 3 promotion happens exclusively via the approve-kyc edge function
-- with scope='id_and_address', making it an explicit admin decision.

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

    -- Auto-promote to tier_2 on ID approval regardless of framework version.
    -- Tier 3 is never set here — it requires an admin to call approve-kyc
    -- with scope='id_and_address', which upserts user_risk_tiers directly.
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
      -- Never downgrade an already higher tier
      WHERE public.user_risk_tiers.current_tier < EXCLUDED.current_tier;
    END IF;

    SELECT account_number INTO v_has_acct FROM public.profiles WHERE user_id = NEW.user_id;
    IF v_has_acct IS NULL THEN
      v_acct := public.generate_account_number();
      UPDATE public.profiles
        SET account_number    = v_acct,
            account_status    = 'active',
            kyc_completed_at  = now(),
            kyc_status        = 'verified',
            kyc_tier          = COALESCE(v_new_tier::public.kyc_tier, kyc_tier)
        WHERE user_id = NEW.user_id;
    ELSE
      UPDATE public.profiles
        SET account_status    = 'active',
            kyc_completed_at  = COALESCE(kyc_completed_at, now()),
            kyc_status        = 'verified',
            kyc_tier          = COALESCE(v_new_tier::public.kyc_tier, kyc_tier)
        WHERE user_id = NEW.user_id
          AND date_of_birth IS NOT NULL;
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
