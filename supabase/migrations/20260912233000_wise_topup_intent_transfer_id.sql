-- Link a Wise pay-in intent to a parked send so the webhook can release payout.

ALTER TABLE public.wise_topup_intents
  ADD COLUMN IF NOT EXISTS transfer_id uuid REFERENCES public.transfers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS wise_topup_intents_transfer_idx
  ON public.wise_topup_intents (transfer_id)
  WHERE transfer_id IS NOT NULL;

COMMENT ON COLUMN public.wise_topup_intents.transfer_id IS
  'Parked send released by execute-transfer after this Wise deposit credits the wallet.';
