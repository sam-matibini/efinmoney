
CREATE TABLE public.cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_type TEXT NOT NULL DEFAULT 'virtual' CHECK (card_type IN ('virtual', 'physical')),
  card_network TEXT NOT NULL DEFAULT 'visa' CHECK (card_network IN ('visa', 'mastercard')),
  last_four TEXT NOT NULL,
  cardholder_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'cancelled')),
  spending_limit NUMERIC NOT NULL DEFAULT 5000,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  expires_at DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '4 years'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cards"
  ON public.cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own cards"
  ON public.cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cards"
  ON public.cards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cards"
  ON public.cards FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all cards"
  ON public.cards FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_cards_updated_at
  BEFORE UPDATE ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cards_user_id ON public.cards(user_id);
CREATE INDEX idx_cards_status ON public.cards(status);
