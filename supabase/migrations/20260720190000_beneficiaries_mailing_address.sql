-- Contact phone is already on beneficiaries.phone; add mailing address fields.
ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS mailing_address text,
  ADD COLUMN IF NOT EXISTS mailing_city text,
  ADD COLUMN IF NOT EXISTS mailing_region text,
  ADD COLUMN IF NOT EXISTS mailing_postal_code text;

NOTIFY pgrst, 'reload schema';
