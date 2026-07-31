-- Repair: users with approved kyc_verifications but stale profiles.kyc_status.
-- The on_kyc_status_change trigger handles new approvals going forward;
-- this one-time sweep fixes existing rows that missed the trigger.
-- Users without date_of_birth are intentionally skipped — enforce_verified_has_dob
-- blocks the update, and they need DOB collected before being marked verified.

UPDATE public.profiles p
SET
  kyc_status     = 'verified',
  account_status = CASE WHEN account_status = 'pending_verification' THEN 'active' ELSE account_status END,
  kyc_completed_at = COALESCE(kyc_completed_at, kv.reviewed_at, now())
FROM public.kyc_verifications kv
WHERE kv.user_id = p.user_id
  AND kv.verification_status = 'approved'
  AND p.kyc_status != 'verified'
  AND p.date_of_birth IS NOT NULL;

-- Also ensure kyc_tier on profiles matches user_risk_tiers (catches any drift there too).
UPDATE public.profiles p
SET kyc_tier = urt.current_tier::text::public.kyc_tier
FROM public.user_risk_tiers urt
WHERE p.user_id = urt.user_id
  AND p.kyc_tier::text IS DISTINCT FROM urt.current_tier::text;
