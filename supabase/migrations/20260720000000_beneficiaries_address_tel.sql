-- Add address and telephone columns to beneficiaries
-- Safe to re-run (IF NOT EXISTS)

ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS tel text;
