ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS external_reference text;
CREATE INDEX IF NOT EXISTS idx_ledger_entries_ext_ref ON public.ledger_entries (reference_type, external_reference);