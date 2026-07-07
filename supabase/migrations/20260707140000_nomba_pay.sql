-- Nomba hosted checkout (Nigeria NGN + international USD/EUR/GBP)

CREATE TABLE public.nomba_pay_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  corridor text NOT NULL CHECK (corridor IN ('nigeria', 'international')),
  reference text NOT NULL UNIQUE,
  order_id text UNIQUE,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL,
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

GRANT SELECT, INSERT, UPDATE ON public.nomba_pay_transactions TO authenticated;
GRANT ALL ON public.nomba_pay_transactions TO service_role;

ALTER TABLE public.nomba_pay_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own nomba pay txns"
  ON public.nomba_pay_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Users insert own nomba pay txns"
  ON public.nomba_pay_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins update nomba pay txns"
  ON public.nomba_pay_transactions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_nomba_pay_transactions_updated
  BEFORE UPDATE ON public.nomba_pay_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_nomba_pay_user ON public.nomba_pay_transactions(user_id);
CREATE INDEX idx_nomba_pay_order ON public.nomba_pay_transactions(order_id);
CREATE INDEX idx_nomba_pay_status ON public.nomba_pay_transactions(status);

INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
VALUES
  ('1255', 'Nomba Settlement - NGN', 'asset', 'NGN', true, true),
  ('1256', 'Nomba Settlement - USD', 'asset', 'USD', true, true),
  ('1257', 'Nomba Settlement - EUR', 'asset', 'EUR', true, true),
  ('1258', 'Nomba Settlement - GBP', 'asset', 'GBP', true, true)
ON CONFLICT (code) DO NOTHING;
