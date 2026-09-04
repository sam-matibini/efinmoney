-- ePay settlement asset accounts for wallet top-ups (after Dodo 1295–1299)
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
VALUES
  ('1300', 'ePay Settlement USD', 'asset', 'USD', true, true),
  ('1301', 'ePay Settlement CAD', 'asset', 'CAD', true, true),
  ('1302', 'ePay Settlement EUR', 'asset', 'EUR', true, true),
  ('1303', 'ePay Settlement GBP', 'asset', 'GBP', true, true),
  ('1304', 'ePay Settlement NGN', 'asset', 'NGN', true, true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.epay_payin_transactions (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid,
  currency text NOT NULL,
  amount numeric NOT NULL,
  epay_order_no text,
  status text NOT NULL DEFAULT 'pending',
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS epay_payin_transactions_user_id_idx
  ON public.epay_payin_transactions (user_id);
CREATE INDEX IF NOT EXISTS epay_payin_transactions_epay_order_no_idx
  ON public.epay_payin_transactions (epay_order_no);

ALTER TABLE public.epay_payin_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS epay_payin_select_own ON public.epay_payin_transactions;
CREATE POLICY epay_payin_select_own ON public.epay_payin_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.epay_payin_transactions TO authenticated;
GRANT ALL ON public.epay_payin_transactions TO service_role;

COMMENT ON TABLE public.epay_payin_transactions IS
  'ePay cashier gateway pay-in (wallet top-up) tracking; id = merchantOrderNo';
