ALTER TABLE public.fincra_cad_interac_intents
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS sender_email text,
  ADD COLUMN IF NOT EXISTS sender_bank text;

NOTIFY pgrst, 'reload schema';