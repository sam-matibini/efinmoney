ALTER TABLE public.fincra_cad_interac_intents
  ADD COLUMN IF NOT EXISTS transfer_id uuid REFERENCES public.transfers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'topup';

CREATE INDEX IF NOT EXISTS fincra_cad_interac_intents_transfer_id_idx
  ON public.fincra_cad_interac_intents (transfer_id);

NOTIFY pgrst, 'reload schema';