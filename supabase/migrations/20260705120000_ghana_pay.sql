-- Ghana direct mobile-money rail (collection + payout tracking)

CREATE TABLE public.ghana_pay_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('collection', 'payout')),
  reference text NOT NULL UNIQUE,
  transaction_id text NOT NULL,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL DEFAULT 'GHS',
  network text NOT NULL,
  customer_number text NOT NULL,
  nickname text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  failure_reason text,
  target_wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  transfer_id uuid REFERENCES public.transfers(id) ON DELETE SET NULL,
  provider_reference text,
  raw_request jsonb,
  raw_response jsonb,
  last_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ghana_pay_transactions TO authenticated;
GRANT ALL ON public.ghana_pay_transactions TO service_role;

ALTER TABLE public.ghana_pay_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ghana pay txns"
  ON public.ghana_pay_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Users insert own ghana pay txns"
  ON public.ghana_pay_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins update ghana pay txns"
  ON public.ghana_pay_transactions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_ghana_pay_transactions_updated
  BEFORE UPDATE ON public.ghana_pay_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ghana_pay_user ON public.ghana_pay_transactions(user_id);
CREATE INDEX idx_ghana_pay_transfer ON public.ghana_pay_transactions(transfer_id);
CREATE INDEX idx_ghana_pay_status ON public.ghana_pay_transactions(status);
CREATE INDEX idx_ghana_pay_txn_id ON public.ghana_pay_transactions(transaction_id);

-- Settlement + payable accounts for GHS corridor
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
VALUES
  ('1254', 'Ghana Pay Settlement - GHS', 'asset', 'GHS', true, true),
  ('2126', 'Mobile Money Payable - GHS', 'liability', 'GHS', true, true)
ON CONFLICT (code) DO NOTHING;
