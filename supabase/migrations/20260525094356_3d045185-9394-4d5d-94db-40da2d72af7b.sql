
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
BEGIN
  IF NEW.verification_status = 'approved'
     AND (OLD.verification_status IS DISTINCT FROM NEW.verification_status) THEN

    -- Persona Gov ID + Selfie approval is sufficient for Tier 3.
    IF NEW.id_verification_status = 'approved' THEN
      v_new_tier := 'tier_3';
      INSERT INTO public.user_risk_tiers (user_id, current_tier, daily_transaction_limit, monthly_transaction_limit, single_transaction_limit, features_enabled, upgraded_at)
      VALUES (NEW.user_id,'tier_3',50000,500000,50000,
              '{"receive": true, "send": true, "international": true, "virtual_card": true}'::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE SET
        current_tier='tier_3',
        daily_transaction_limit=50000,
        monthly_transaction_limit=500000,
        single_transaction_limit=50000,
        features_enabled='{"receive": true, "send": true, "international": true, "virtual_card": true}'::jsonb,
        upgraded_at=now(),
        updated_at=now();
    END IF;

    SELECT account_number INTO v_has_acct FROM public.profiles WHERE user_id = NEW.user_id;
    IF v_has_acct IS NULL THEN
      v_acct := public.generate_account_number();
      UPDATE public.profiles
        SET account_number = v_acct,
            account_status = 'active',
            kyc_completed_at = now(),
            kyc_status = 'verified',
            kyc_tier = COALESCE(v_new_tier::kyc_tier, kyc_tier)
        WHERE user_id = NEW.user_id;
    ELSE
      UPDATE public.profiles
        SET account_status = 'active',
            kyc_completed_at = COALESCE(kyc_completed_at, now()),
            kyc_status = 'verified',
            kyc_tier = COALESCE(v_new_tier::kyc_tier, kyc_tier)
        WHERE user_id = NEW.user_id;
    END IF;

    INSERT INTO public.kyc_audit_log (kyc_verification_id, admin_id, action, previous_status, new_status, notes)
    VALUES (NEW.id,
            CASE WHEN auth.uid() IS NOT NULL AND public.is_admin_user(auth.uid()) THEN auth.uid() ELSE NULL END,
            'approved', OLD.verification_status::text, NEW.verification_status::text, NULL);
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill: promote any approved-ID users currently below Tier 3 to Tier 3.
INSERT INTO public.user_risk_tiers (user_id, current_tier, daily_transaction_limit, monthly_transaction_limit, single_transaction_limit, features_enabled, upgraded_at)
SELECT k.user_id, 'tier_3', 50000, 500000, 50000,
       '{"receive": true, "send": true, "international": true, "virtual_card": true}'::jsonb, now()
  FROM public.kyc_verifications k
 WHERE k.verification_status = 'approved'
   AND k.id_verification_status = 'approved'
ON CONFLICT (user_id) DO UPDATE SET
  current_tier='tier_3',
  daily_transaction_limit=50000,
  monthly_transaction_limit=500000,
  single_transaction_limit=50000,
  features_enabled='{"receive": true, "send": true, "international": true, "virtual_card": true}'::jsonb,
  upgraded_at=now(),
  updated_at=now()
WHERE user_risk_tiers.current_tier <> 'tier_3';

UPDATE public.profiles p
   SET kyc_tier = 'tier_3',
       kyc_status = 'verified',
       account_status = 'active',
       kyc_completed_at = COALESCE(p.kyc_completed_at, now())
  FROM public.kyc_verifications k
 WHERE k.user_id = p.user_id
   AND k.verification_status = 'approved'
   AND k.id_verification_status = 'approved'
   AND p.kyc_tier IS DISTINCT FROM 'tier_3';
