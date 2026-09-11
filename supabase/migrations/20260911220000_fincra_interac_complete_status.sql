-- Allow settled + completed Interac intent statuses (user Complete + webhook).
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.fincra_cad_interac_intents'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.fincra_cad_interac_intents DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.fincra_cad_interac_intents
  ADD CONSTRAINT fincra_cad_interac_intents_status_check
  CHECK (status IN (
    'pending',
    'awaiting_payment',
    'received',
    'matched',
    'confirmed',
    'settled',
    'completed',
    'expired',
    'unmatched',
    'refunded',
    'cancelled'
  ));

CREATE INDEX IF NOT EXISTS fincra_cad_interac_intents_provider_reference_idx
  ON public.fincra_cad_interac_intents (provider_reference)
  WHERE provider_reference IS NOT NULL;
