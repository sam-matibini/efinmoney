
-- Payee directory upgrade
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

-- Payment link preloaded payout details
ALTER TABLE public.payment_link_payouts
  ADD COLUMN IF NOT EXISTS preset_method text,
  ADD COLUMN IF NOT EXISTS preset_payload jsonb,
  ADD COLUMN IF NOT EXISTS auto_claim boolean NOT NULL DEFAULT false;

ALTER TABLE public.payment_link_payouts
  DROP CONSTRAINT IF EXISTS payment_link_payouts_preset_method_check;
ALTER TABLE public.payment_link_payouts
  ADD CONSTRAINT payment_link_payouts_preset_method_check
  CHECK (preset_method IS NULL OR preset_method IN ('eft','interac','card'));
