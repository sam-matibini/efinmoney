CREATE OR REPLACE FUNCTION public.on_kyc_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acct text;
  v_has_acct text;
  v_new_tier text;
  v_limits public.tier_limits%ROWTYPE;
  v_should_run boolean := false;
BEGIN
  -- Re-evaluate tier whenever the verification is approved AND any of the
  -- relevant fields changed. Previously we only fired on a status transition
  -- to 'approved', which meant a Tier 2 user being upgraded to Tier 3 (status
  -- already 'approved', only address_verification_status changes) was ignored.
  IF NEW.verification_status = 'approved' THEN
    IF OLD.verification_status IS DISTINCT FROM NEW.verification_status
       OR OLD.id_verification_status IS DISTINCT FROM NEW.id_verification_status
       OR OLD.address_verification_status IS DISTINCT FROM NEW.address_verification_status
       OR OLD.source_of_funds_status IS DISTINCT FROM NEW.source_of_funds_status THEN
      v_should_run := true;
    END IF;
  END IF;

  IF v_should_run THEN
    -- Tier_3 now only requires ID + address approved (matches approve-kyc
    -- 'id_and_address' scope). source_of_funds remains a soft signal but is
    -- no longer a hard gate.
    IF NEW.address_verification_status = 'approved'
       AND NEW.id_verification_status = 'approved' THEN
      v_new_tier := 'tier_3';
    ELSIF NEW.id_verification_status = 'approved' THEN
      v_new_tier := 'tier_2';
    END IF;

    IF v_new_tier IS NOT NULL THEN
      SELECT * INTO v_limits FROM public.tier_limits WHERE tier = v_new_tier::public.user_risk_tier;
      INSERT INTO public.user_risk_tiers (user_id, current_tier, daily_transaction_limit, monthly_transaction_limit, single_transaction_limit, features_enabled, upgraded_at)
      VALUES (NEW.user_id, v_new_tier::public.user_risk_tier, v_limits.daily_limit, v_limits.monthly_limit, v_limits.single_limit, v_limits.features_enabled, now())
      ON CONFLICT (user_id) DO UPDATE SET
        current_tier = v_new_tier::public.user_risk_tier,
        daily_transaction_limit = v_limits.daily_limit,
        monthly_transaction_limit = v_limits.monthly_limit,
        single_transaction_limit = v_limits.single_limit,
        features_enabled = v_limits.features_enabled,
        upgraded_at = now(),
        updated_at = now();
    END IF;

    SELECT account_number INTO v_has_acct FROM public.profiles WHERE user_id = NEW.user_id;
    IF v_has_acct IS NULL THEN
      v_acct := public.generate_account_number();
      UPDATE public.profiles
        SET account_number = v_acct,
            account_status = 'active',
            kyc_completed_at = now(),
            kyc_status = 'verified',
            kyc_tier = COALESCE(v_new_tier::public.kyc_tier, kyc_tier)
        WHERE user_id = NEW.user_id;
    ELSE
      UPDATE public.profiles
        SET account_status = 'active',
            kyc_completed_at = COALESCE(kyc_completed_at, now()),
            kyc_status = 'verified',
            kyc_tier = COALESCE(v_new_tier::public.kyc_tier, kyc_tier)
        WHERE user_id = NEW.user_id;
    END IF;

    INSERT INTO public.kyc_audit_log (kyc_verification_id, admin_id, action, previous_status, new_status, notes)
    VALUES (NEW.id,
            CASE WHEN auth.uid() IS NOT NULL AND public.is_admin_user(auth.uid()) THEN auth.uid() ELSE NULL END,
            'approved', OLD.verification_status::text, NEW.verification_status::text,
            'framework_v2 → ' || COALESCE(v_new_tier,'no_tier_change'));
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill: re-sync any users whose KYC is approved with id+address but who
-- are still stuck on a lower tier than they should be.
DO $$
DECLARE
  r RECORD;
  v_limits public.tier_limits%ROWTYPE;
  v_target text;
BEGIN
  FOR r IN
    SELECT k.user_id, k.id_verification_status, k.address_verification_status,
           t.current_tier
      FROM public.kyc_verifications k
      LEFT JOIN public.user_risk_tiers t ON t.user_id = k.user_id
     WHERE k.verification_status = 'approved'
  LOOP
    v_target := NULL;
    IF r.id_verification_status = 'approved' AND r.address_verification_status = 'approved' THEN
      v_target := 'tier_3';
    ELSIF r.id_verification_status = 'approved' THEN
      v_target := 'tier_2';
    END IF;

    IF v_target IS NOT NULL AND (r.current_tier IS NULL OR r.current_tier::text <> v_target) THEN
      SELECT * INTO v_limits FROM public.tier_limits WHERE tier = v_target::public.user_risk_tier;
      INSERT INTO public.user_risk_tiers (user_id, current_tier, daily_transaction_limit, monthly_transaction_limit, single_transaction_limit, features_enabled, upgraded_at)
      VALUES (r.user_id, v_target::public.user_risk_tier, v_limits.daily_limit, v_limits.monthly_limit, v_limits.single_limit, v_limits.features_enabled, now())
      ON CONFLICT (user_id) DO UPDATE SET
        current_tier = v_target::public.user_risk_tier,
        daily_transaction_limit = v_limits.daily_limit,
        monthly_transaction_limit = v_limits.monthly_limit,
        single_transaction_limit = v_limits.single_limit,
        features_enabled = v_limits.features_enabled,
        upgraded_at = now(),
        updated_at = now();

      UPDATE public.profiles
         SET kyc_tier = v_target::public.kyc_tier
       WHERE user_id = r.user_id;
    END IF;
  END LOOP;
END $$;