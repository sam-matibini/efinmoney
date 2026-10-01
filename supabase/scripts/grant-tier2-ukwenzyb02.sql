-- Dev/test only: set ukwenzyb02@gmail.com to Tier 2 (ID approved, address NOT approved)
-- so the Tier 3 (proof of address) flow can be tested. Safe to re-run.

DO $$
DECLARE
  v_user_id uuid;
  v_dob date;
  v_limits public.tier_limits%ROWTYPE;
BEGIN
  SELECT user_id, date_of_birth INTO v_user_id, v_dob
  FROM public.profiles
  WHERE lower(email) = lower('ukwenzyb02@gmail.com');

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No profile found for ukwenzyb02@gmail.com';
  END IF;

  SELECT * INTO v_limits FROM public.tier_limits WHERE tier = 'tier_2'::public.user_risk_tier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tier_limits row for tier_2 missing';
  END IF;

  INSERT INTO public.kyc_verifications (
    user_id, verification_status, id_verification_status, liveness_check_status,
    address_verification_status, verification_provider, submitted_at, reviewed_at
  ) VALUES (
    v_user_id, 'approved', 'approved', 'approved', 'pending', 'manual', now(), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    verification_status = 'approved',
    id_verification_status = 'approved',
    liveness_check_status = 'approved',
    address_verification_status = 'pending',
    id_rejection_reason = NULL,
    reviewed_at = now();

  INSERT INTO public.user_risk_tiers (
    user_id, current_tier, daily_transaction_limit, monthly_transaction_limit,
    single_transaction_limit, features_enabled, upgraded_at
  ) VALUES (
    v_user_id, 'tier_2'::public.user_risk_tier, v_limits.daily_limit, v_limits.monthly_limit,
    v_limits.single_limit, v_limits.features_enabled, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    current_tier = 'tier_2'::public.user_risk_tier,
    daily_transaction_limit = EXCLUDED.daily_transaction_limit,
    monthly_transaction_limit = EXCLUDED.monthly_transaction_limit,
    single_transaction_limit = EXCLUDED.single_transaction_limit,
    features_enabled = EXCLUDED.features_enabled,
    upgraded_at = now(),
    updated_at = now();

  -- enforce_verified_has_dob rejects kyc_status='verified' without a date of birth.
  IF v_dob IS NOT NULL THEN
    UPDATE public.profiles
    SET kyc_status = 'verified'::public.kyc_status,
        kyc_tier = 'tier_2'::public.kyc_tier,
        kyc_completed_at = COALESCE(kyc_completed_at, now()),
        account_status = 'active'
    WHERE user_id = v_user_id;
  ELSE
    UPDATE public.profiles
    SET kyc_tier = 'tier_2'::public.kyc_tier,
        account_status = 'active'
    WHERE user_id = v_user_id;
    RAISE NOTICE 'No date_of_birth on profile: tier set to 2 but kyc_status left unchanged';
  END IF;
END $$;

SELECT p.email, p.date_of_birth, p.kyc_status, p.kyc_tier, p.account_number, urt.current_tier,
  k.verification_status, k.id_verification_status, k.address_verification_status
FROM public.profiles p
LEFT JOIN public.user_risk_tiers urt ON urt.user_id = p.user_id
LEFT JOIN public.kyc_verifications k ON k.user_id = p.user_id
WHERE lower(p.email) = lower('ukwenzyb02@gmail.com');
