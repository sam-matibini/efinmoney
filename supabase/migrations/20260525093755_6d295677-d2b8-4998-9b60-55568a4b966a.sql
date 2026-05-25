-- Fix type mismatch in on_kyc_status_change: v_new_tier is text, kyc_tier is enum
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

    IF NEW.id_verification_status = 'approved' AND NEW.address_verification_status = 'approved' THEN
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
    ELSIF NEW.id_verification_status = 'approved' THEN
      v_new_tier := 'tier_2';
      INSERT INTO public.user_risk_tiers (user_id, current_tier, daily_transaction_limit, monthly_transaction_limit, single_transaction_limit, features_enabled, upgraded_at)
      VALUES (NEW.user_id,'tier_2',5000,50000,5000,
              '{"receive": true, "send": true, "international": false, "virtual_card": false}'::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE SET
        current_tier='tier_2',
        daily_transaction_limit=5000,
        monthly_transaction_limit=50000,
        single_transaction_limit=5000,
        features_enabled='{"receive": true, "send": true, "international": false, "virtual_card": false}'::jsonb,
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

-- Now restore the user's verification row
UPDATE public.kyc_verifications
SET verification_status = 'approved',
    id_verification_status = 'approved',
    id_rejection_reason = NULL,
    persona_decision = 'approved',
    persona_decision_reason = NULL,
    persona_inquiry_status = 'approved',
    reviewed_at = COALESCE(reviewed_at, now())
WHERE user_id = 'f69e6ab1-695d-49f8-8ea6-c5362af9cf95';

INSERT INTO public.kyc_audit_log (kyc_verification_id, admin_id, action, previous_status, new_status, notes)
SELECT id, NULL, 'manual_correction', 'rejected', 'approved',
       'Corrected after persona-webhook overwrote an already-approved verification with PEP MATCH from a duplicate inquiry. Webhook now has an idempotency guard.'
FROM public.kyc_verifications
WHERE user_id = 'f69e6ab1-695d-49f8-8ea6-c5362af9cf95';