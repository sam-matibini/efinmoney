-- Onboarding Tier 1: capture phone, DOB, occupation, nationality at signup
-- so the admin user view (UserDetailPage) stops showing "—" for every new user.
-- All four columns are nullable (existing rows + backfill path) and the
-- verified-user lock trigger in 20260731094625 only blocks mutations to
-- address / phone / DOB AFTER kyc_status='verified', so populating them at
-- signup is safe.
--
-- Self-contained: re-asserts date_of_birth / occupation in case the
-- earlier migration that introduced them wasn't applied on this DB.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS nationality varchar(2);

GRANT SELECT (
  id, user_id, email, full_name, phone_number, country_code, kyc_status, kyc_tier,
  default_currency, avatar_url, created_at, updated_at, account_number, account_status,
  kyc_completed_at, street_address, city, state_province, postal_code, address_country,
  stellar_public_key, efin_tag, kyc_framework_version, aml_last_screened_at,
  date_of_birth, occupation, nationality, risk_level
) ON public.profiles TO authenticated;
