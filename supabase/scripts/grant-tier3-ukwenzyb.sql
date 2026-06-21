-- Dev/test only: grant Tier 3 to ukwenzyb@gmail.com for eFinVISA testing.
-- Run in Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent).

DO $$
DECLARE
  v_user_id uuid;
  v_kyc_id uuid;
  v_limits public.tier_limits%ROWTYPE;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.profiles
  WHERE lower(email) = lower('ukwenzyb@gmail.com');

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No profile found for ukwenzyb@gmail.com';
  END IF;

  SELECT * INTO v_limits FROM public.tier_limits WHERE tier = 'tier_3'::public.user_risk_tier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tier_limits row for tier_3 missing';
  END IF;

  -- Ensure KYC row exists and is fully approved (ID + address → Tier 3 trigger logic)
  SELECT id INTO v_kyc_id
  FROM public.kyc_verifications
  WHERE user_id = v_user_id;

  IF v_kyc_id IS NULL THEN
    INSERT INTO public.kyc_verifications (
      user_id,
      verification_status,
      id_verification_status,
      address_verification_status,
      liveness_check_status,
      submitted_at,
      reviewed_at
    ) VALUES (
      v_user_id,
      'approved',
      'approved',
      'approved',
      'approved',
      now(),
      now()
    )
    RETURNING id INTO v_kyc_id;
  ELSE
    UPDATE public.kyc_verifications
    SET
      verification_status = 'approved',
      id_verification_status = 'approved',
      address_verification_status = 'approved',
      liveness_check_status = COALESCE(liveness_check_status, 'approved'),
      reviewed_at = now()
    WHERE id = v_kyc_id;
  END IF;

  INSERT INTO public.user_risk_tiers (
    user_id,
    current_tier,
    daily_transaction_limit,
    monthly_transaction_limit,
    single_transaction_limit,
    features_enabled,
    upgraded_at
  ) VALUES (
    v_user_id,
    'tier_3'::public.user_risk_tier,
    v_limits.daily_limit,
    v_limits.monthly_limit,
    v_limits.single_limit,
    v_limits.features_enabled,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    current_tier = 'tier_3'::public.user_risk_tier,
    daily_transaction_limit = EXCLUDED.daily_transaction_limit,
    monthly_transaction_limit = EXCLUDED.monthly_transaction_limit,
    single_transaction_limit = EXCLUDED.single_transaction_limit,
    features_enabled = EXCLUDED.features_enabled,
    upgraded_at = now(),
    updated_at = now();

  UPDATE public.profiles
  SET
    kyc_status = 'verified'::public.kyc_status,
    kyc_tier = 'tier_3'::public.kyc_tier,
    kyc_completed_at = COALESCE(kyc_completed_at, now()),
    account_status = COALESCE(account_status, 'active')
  WHERE user_id = v_user_id;

  RAISE NOTICE 'Tier 3 granted for user_id=% (ukwenzyb@gmail.com)', v_user_id;
END $$;

-- Verify:
SELECT p.email, p.kyc_status, p.kyc_tier, urt.current_tier, urt.features_enabled
FROM public.profiles p
LEFT JOIN public.user_risk_tiers urt ON urt.user_id = p.user_id
WHERE lower(p.email) = lower('ukwenzyb@gmail.com');
