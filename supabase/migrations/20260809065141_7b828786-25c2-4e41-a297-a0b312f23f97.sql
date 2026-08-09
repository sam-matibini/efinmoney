ALTER TABLE public.fincra_cad_interac_intents
  ADD COLUMN IF NOT EXISTS sender_account_type text,
  ADD COLUMN IF NOT EXISTS sender_address_line1 text,
  ADD COLUMN IF NOT EXISTS sender_address_line2 text,
  ADD COLUMN IF NOT EXISTS sender_city text,
  ADD COLUMN IF NOT EXISTS sender_region text,
  ADD COLUMN IF NOT EXISTS sender_postal_code text,
  ADD COLUMN IF NOT EXISTS sender_country text DEFAULT 'CA',
  ADD COLUMN IF NOT EXISTS hosted_url text;

GRANT SELECT, INSERT, UPDATE ON public.fincra_cad_interac_intents TO authenticated;
GRANT ALL ON public.fincra_cad_interac_intents TO service_role;