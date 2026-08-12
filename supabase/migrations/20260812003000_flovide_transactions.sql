-- Flovide (OhentPay) CAD Interac collections + ledger settlement accounts
CREATE TABLE IF NOT EXISTS public.flovide_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'interac_collection'
    CHECK (kind IN ('interac_collection', 'payout', 'exchange')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'awaiting_payment', 'processing', 'completed', 'failed', 'expired')),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL DEFAULT 'CAD',
  credit_amount numeric(18,2),
  credit_currency text,
  target_wallet_id uuid REFERENCES public.wallets(id),
  purpose text NOT NULL DEFAULT 'topup'
    CHECK (purpose IN ('topup', 'transfer', 'merchant_collection')),
  transfer_id uuid,
  payer_email text,
  payer_name text,
  reference text NOT NULL,
  provider_reference text,
  provider_order_id text,
  provider_txn_id text,
  failure_reason text,
  raw_request jsonb,
  raw_response jsonb,
  last_event jsonb,
  credited_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS flovide_transactions_reference_key
  ON public.flovide_transactions (reference);
CREATE UNIQUE INDEX IF NOT EXISTS flovide_transactions_provider_ref_key
  ON public.flovide_transactions (provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flovide_tx_user_status
  ON public.flovide_transactions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_flovide_tx_payer_email
  ON public.flovide_transactions (lower(payer_email));

ALTER TABLE public.flovide_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flovide_transactions_select_own ON public.flovide_transactions;
CREATE POLICY flovide_transactions_select_own
  ON public.flovide_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.flovide_transactions TO authenticated;
GRANT ALL ON public.flovide_transactions TO service_role;

-- Settlement assets (Flovide) — 1380+ block (after PayPal 1370)
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
VALUES
  ('1380', 'Flovide Settlement USD', 'asset', 'USD', true, true),
  ('1381', 'Flovide Settlement CAD', 'asset', 'CAD', true, true),
  ('1382', 'Flovide Settlement EUR', 'asset', 'EUR', true, true),
  ('1383', 'Flovide Settlement GBP', 'asset', 'GBP', true, true),
  ('1384', 'Flovide Settlement NGN', 'asset', 'NGN', true, true),
  ('1385', 'Flovide Settlement GHS', 'asset', 'GHS', true, true),
  ('1386', 'Flovide Settlement KES', 'asset', 'KES', true, true),
  ('1387', 'Flovide Settlement UGX', 'asset', 'UGX', true, true),
  ('1388', 'Flovide Settlement XOF', 'asset', 'XOF', true, true),
  ('1389', 'Flovide Settlement ZAR', 'asset', 'ZAR', true, true)
ON CONFLICT (code) DO NOTHING;
