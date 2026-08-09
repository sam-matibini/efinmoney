ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_region text,
  ADD COLUMN IF NOT EXISTS address_postal_code text,
  ADD COLUMN IF NOT EXISTS address_country_code text,
  ADD COLUMN IF NOT EXISTS mailing_country_code text;

NOTIFY pgrst, 'reload schema';