-- Migrate all existing users to KYC framework v2
UPDATE public.profiles
   SET kyc_framework_version = 2
 WHERE COALESCE(kyc_framework_version, 1) <> 2;

-- Apply v2 tier_limits to every user_risk_tiers row (except tier_4 premium which stays manual)
UPDATE public.user_risk_tiers urt
   SET daily_transaction_limit   = tl.daily_limit,
       monthly_transaction_limit = tl.monthly_limit,
       single_transaction_limit  = tl.single_limit,
       features_enabled          = tl.features_enabled,
       updated_at                = now()
  FROM public.tier_limits tl
 WHERE urt.current_tier = tl.tier
   AND urt.current_tier <> 'tier_4';

-- Simplify on_kyc_status_change: remove legacy v1 generous-limits branch
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
BEGIN
  IF NEW.verification_status = 'approved'
     AND (OLD.verification_status IS DISTINCT FROM NEW.verification_status) THEN

    -- Unified v2 progressive 3-tier model for all users
    IF NEW.address_verification_status = 'approved'
       AND NEW.source_of_funds_status = 'approved' THEN
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