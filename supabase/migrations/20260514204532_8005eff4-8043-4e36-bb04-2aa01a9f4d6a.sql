ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS external_reference text;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ledger_external_ref_per_account
  ON public.ledger_entries (reference_type, external_reference, account_id)
  WHERE external_reference IS NOT NULL;