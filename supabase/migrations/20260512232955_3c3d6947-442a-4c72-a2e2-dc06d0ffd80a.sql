
ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS interac_security_question text,
  ADD COLUMN IF NOT EXISTS interac_security_answer text,
  ADD COLUMN IF NOT EXISTS paysafe_payment_id text;
