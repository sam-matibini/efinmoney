
INSERT INTO public.profiles (user_id, email, full_name, kyc_tier, kyc_status, account_status, kyc_completed_at, default_currency)
SELECT u.id,
       u.email,
       COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
       'tier_3'::kyc_tier,
       'verified'::kyc_status,
       'active',
       now(),
       'CAD'
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
LEFT JOIN public.user_risk_tiers t ON t.user_id = u.id
WHERE p.user_id IS NULL
  AND t.current_tier IN ('tier_3','tier_4');
