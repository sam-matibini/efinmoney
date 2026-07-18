-- Paytota card / MoMo collection (top-up)

CREATE TABLE public.paytota_payin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  purchase_id text UNIQUE,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL,
  credit_amount numeric(18, 2),
  credit_currency varchar(3),
  checkout_amount numeric(18, 2),
  checkout_currency varchar(3),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  failure_reason text,
  target_wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  checkout_url text,
  provider_reference text,
  raw_request jsonb,
  raw_response jsonb,
  last_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_paytota_payin_user ON public.paytota_payin_transactions(user_id);
CREATE INDEX idx_paytota_payin_purchase ON public.paytota_payin_transactions(purchase_id);
CREATE INDEX idx_paytota_payin_status ON public.paytota_payin_transactions(status);

GRANT SELECT, INSERT, UPDATE ON public.paytota_payin_transactions TO authenticated;
GRANT ALL ON public.paytota_payin_transactions TO service_role;

ALTER TABLE public.paytota_payin_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY paytota_payin_select_own ON public.paytota_payin_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE OR REPLACE FUNCTION public.set_paytota_payin_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_paytota_payin_updated
  BEFORE UPDATE ON public.paytota_payin_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_paytota_payin_updated_at();
