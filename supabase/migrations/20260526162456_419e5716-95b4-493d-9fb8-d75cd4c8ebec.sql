-- Demote users incorrectly in tier_3 (must have both address + source of funds approved)
WITH bad_t3 AS (
  SELECT urt.user_id
  FROM public.user_risk_tiers urt
  LEFT JOIN public.kyc_verifications kv ON kv.user_id = urt.user_id
  WHERE urt.current_tier = 'tier_3'
    AND (kv.address_verification_status IS DISTINCT FROM 'approved'
         OR kv.source_of_funds_status IS DISTINCT FROM 'approved')
),
t2_defaults AS (
  SELECT * FROM public.tier_limits WHERE tier = 'tier_2'
)
UPDATE public.user_risk_tiers urt
SET current_tier = 'tier_2',
    single_transaction_limit = t.single_limit,
    daily_transaction_limit = t.daily_limit,
    monthly_transaction_limit = t.monthly_limit,
    features_enabled = t.features_enabled,
    updated_at = now()
FROM t2_defaults t
WHERE urt.user_id IN (SELECT user_id FROM bad_t3)
  AND EXISTS (
    SELECT 1 FROM public.kyc_verifications kv
    WHERE kv.user_id = urt.user_id AND kv.id_verification_status = 'approved'
  );

-- Anyone left in tier_2 or tier_3 without approved ID → demote to tier_1
WITH t1_defaults AS (
  SELECT * FROM public.tier_limits WHERE tier = 'tier_1'
)
UPDATE public.user_risk_tiers urt
SET current_tier = 'tier_1',
    single_transaction_limit = t.single_limit,
    daily_transaction_limit = t.daily_limit,
    monthly_transaction_limit = t.monthly_limit,
    features_enabled = t.features_enabled,
    updated_at = now()
FROM t1_defaults t
WHERE urt.current_tier IN ('tier_2','tier_3')
  AND NOT EXISTS (
    SELECT 1 FROM public.kyc_verifications kv
    WHERE kv.user_id = urt.user_id AND kv.id_verification_status = 'approved'
  );

-- Sync profile.kyc_tier
UPDATE public.profiles p
SET kyc_tier = urt.current_tier::text::public.kyc_tier
FROM public.user_risk_tiers urt
WHERE p.user_id = urt.user_id
  AND p.kyc_tier::text IS DISTINCT FROM urt.current_tier::text;