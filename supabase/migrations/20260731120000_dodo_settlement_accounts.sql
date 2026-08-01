-- Dodo Payments settlement asset accounts for wallet top-ups
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
VALUES
  ('1295', 'Dodo Settlement USD', 'asset', 'USD', true, true),
  ('1296', 'Dodo Settlement CAD', 'asset', 'CAD', true, true),
  ('1297', 'Dodo Settlement EUR', 'asset', 'EUR', true, true),
  ('1298', 'Dodo Settlement GBP', 'asset', 'GBP', true, true),
  ('1299', 'Dodo Settlement NGN', 'asset', 'NGN', true, true)
ON CONFLICT (code) DO NOTHING;

-- Optional pending/complete pay-in tracking
CREATE TABLE IF NOT EXISTS public.dodo_payin_transactions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid,
  currency text NOT NULL,
  amount numeric NOT NULL,
  session_id text,
  payment_id text,
  status text NOT NULL DEFAULT 'pending',
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dodo_payin_transactions_user_id_idx ON public.dodo_payin_transactions (user_id);
CREATE INDEX IF NOT EXISTS dodo_payin_transactions_payment_id_idx ON public.dodo_payin_transactions (payment_id);

ALTER TABLE public.dodo_payin_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dodo_payin_select_own ON public.dodo_payin_transactions;
CREATE POLICY dodo_payin_select_own ON public.dodo_payin_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
