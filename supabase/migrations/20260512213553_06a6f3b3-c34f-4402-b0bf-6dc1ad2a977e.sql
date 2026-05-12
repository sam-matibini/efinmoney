ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS recipient_bank_code character varying(20),
  ADD COLUMN IF NOT EXISTS recipient_bank_name character varying(120);