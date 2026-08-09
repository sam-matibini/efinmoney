CREATE SEQUENCE IF NOT EXISTS public.interac_intent_seq;

CREATE OR REPLACE FUNCTION public.next_interac_public_id()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'EFM-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.interac_intent_seq')::text, 8, '0');
$$;

ALTER TABLE public.fincra_cad_interac_intents
  ADD COLUMN IF NOT EXISTS public_id text,
  ADD COLUMN IF NOT EXISTS merchant_id uuid,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS sender_phone text,
  ADD COLUMN IF NOT EXISTS claimed_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS matched_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS match_tier text,
  ADD COLUMN IF NOT EXISTS wise_transaction_id text,
  ADD COLUMN IF NOT EXISTS unmatched_reason text;

UPDATE public.fincra_cad_interac_intents SET public_id = reference WHERE public_id IS NULL;
UPDATE public.fincra_cad_interac_intents SET status = 'settled' WHERE status = 'credited';

ALTER TABLE public.fincra_cad_interac_intents
  ALTER COLUMN public_id SET DEFAULT public.next_interac_public_id();

CREATE UNIQUE INDEX IF NOT EXISTS fincra_cad_interac_intents_public_id_key
  ON public.fincra_cad_interac_intents (public_id);

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.fincra_cad_interac_intents'::regclass
      AND contype = 'c'
      AND (pg_get_constraintdef(oid) ILIKE '%status%' OR pg_get_constraintdef(oid) ILIKE '%purpose%')
  LOOP
    EXECUTE format('ALTER TABLE public.fincra_cad_interac_intents DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.fincra_cad_interac_intents
  ADD CONSTRAINT fincra_cad_interac_intents_status_check
  CHECK (status IN ('pending','awaiting_payment','received','matched','confirmed','settled','expired','unmatched','refunded','cancelled'));

ALTER TABLE public.fincra_cad_interac_intents
  ADD CONSTRAINT fincra_cad_interac_intents_purpose_check
  CHECK (purpose IN ('topup','transfer','merchant_collection'));

CREATE INDEX IF NOT EXISTS idx_interac_intents_status ON public.fincra_cad_interac_intents (status);
CREATE INDEX IF NOT EXISTS idx_interac_intents_amount ON public.fincra_cad_interac_intents (amount);
CREATE INDEX IF NOT EXISTS idx_interac_intents_sender_email ON public.fincra_cad_interac_intents (lower(sender_email));
CREATE INDEX IF NOT EXISTS idx_interac_intents_wise_txn ON public.fincra_cad_interac_intents (wise_transaction_id);

GRANT SELECT, INSERT, UPDATE ON public.fincra_cad_interac_intents TO authenticated;
GRANT ALL ON public.fincra_cad_interac_intents TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.interac_intent_seq TO service_role;