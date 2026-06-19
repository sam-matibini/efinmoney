-- Payee directory: extend beneficiaries for contacts / Add Payee modal
-- Safe to re-run (IF NOT EXISTS)

ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'person',
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS eft_institution text,
  ADD COLUMN IF NOT EXISTS eft_transit text,
  ADD COLUMN IF NOT EXISTS eft_account text,
  ADD COLUMN IF NOT EXISTS eft_account_holder text,
  ADD COLUMN IF NOT EXISTS interac_email text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.beneficiaries
  DROP CONSTRAINT IF EXISTS beneficiaries_category_check;
ALTER TABLE public.beneficiaries
  ADD CONSTRAINT beneficiaries_category_check
  CHECK (category IN ('person','supplier','employee','contractor','payee','other'));

CREATE INDEX IF NOT EXISTS beneficiaries_user_category_idx
  ON public.beneficiaries(user_id, category);

-- Refresh PostgREST schema cache so API sees new columns immediately
NOTIFY pgrst, 'reload schema';
