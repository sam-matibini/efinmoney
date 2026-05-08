
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_card_type_check;
ALTER TABLE public.cards ADD CONSTRAINT cards_card_type_check
  CHECK (card_type = ANY (ARRAY['virtual','physical','debit','debit_visa','credit']));

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS card_number text,
  ADD COLUMN IF NOT EXISTS cvv text,
  ADD COLUMN IF NOT EXISTS expiry_month int,
  ADD COLUMN IF NOT EXISTS expiry_year int,
  ADD COLUMN IF NOT EXISTS funding_source text NOT NULL DEFAULT 'wallet',
  ADD COLUMN IF NOT EXISTS credit_limit numeric;
