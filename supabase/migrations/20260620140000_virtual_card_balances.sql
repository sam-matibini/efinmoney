-- Virtual card balances: fund from wallets, transfer between cards.

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency_code varchar(10);

-- Backfill currency from linked wallet
UPDATE public.cards c
   SET currency_code = w.currency_code
  FROM public.wallets w
 WHERE c.wallet_id = w.id
   AND c.currency_code IS NULL;

CREATE TABLE IF NOT EXISTS public.virtual_card_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  to_card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  from_wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency_code varchar(10) NOT NULL,
  transfer_type text NOT NULL CHECK (transfer_type IN ('wallet_to_card', 'card_to_card')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.virtual_card_transfers ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.virtual_card_transfers TO service_role;

CREATE POLICY "Users view own virtual card transfers"
  ON public.virtual_card_transfers FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_virtual_card_transfers_user ON public.virtual_card_transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_currency ON public.cards(currency_code);
