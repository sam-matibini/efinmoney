-- Pending Square Checkout (Payment Link) top-ups — credit on return/verify.
CREATE TABLE IF NOT EXISTS public.square_checkout_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  payment_link_id text,
  order_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS square_checkout_intents_user_idx
  ON public.square_checkout_intents (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS square_checkout_intents_order_idx
  ON public.square_checkout_intents (order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.square_checkout_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS square_checkout_intents_select_own ON public.square_checkout_intents;
CREATE POLICY square_checkout_intents_select_own
  ON public.square_checkout_intents FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
