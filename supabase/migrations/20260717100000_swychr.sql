-- Swychr Connect rails (payin, payout, cards, airtime) — secondary provider

CREATE TABLE public.swychr_payin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE,
  transaction_id text NOT NULL UNIQUE,
  provider_id integer,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL,
  country_code varchar(3) NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  failure_reason text,
  target_wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  payment_link text,
  provider_reference text,
  raw_request jsonb,
  raw_response jsonb,
  last_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.swychr_payout_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  transaction_id text NOT NULL UNIQUE,
  country_code varchar(3) NOT NULL,
  amount numeric(18, 2) NOT NULL,
  currency varchar(3) NOT NULL,
  payment_method text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  failure_reason text,
  provider_reference text,
  raw_request jsonb,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.swychr_cardholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  swychr_user_id text NOT NULL,
  email text,
  raw_profile jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.swychr_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cardholder_id uuid REFERENCES public.swychr_cardholders(id) ON DELETE SET NULL,
  swychr_card_id text NOT NULL UNIQUE,
  card_type text,
  last_four text,
  status text NOT NULL DEFAULT 'active',
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.swychr_airtime_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  transaction_id text NOT NULL UNIQUE,
  country_code varchar(3) NOT NULL,
  sku_id text NOT NULL,
  mobile text NOT NULL,
  amount numeric(18, 2) NOT NULL,
  currency varchar(3) NOT NULL,
  cost_usd numeric(18, 4),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  failure_reason text,
  raw_request jsonb,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.swychr_payin_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.swychr_payout_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.swychr_cardholders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.swychr_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.swychr_airtime_transactions TO authenticated;
GRANT ALL ON public.swychr_payin_transactions TO service_role;
GRANT ALL ON public.swychr_payout_transactions TO service_role;
GRANT ALL ON public.swychr_cardholders TO service_role;
GRANT ALL ON public.swychr_cards TO service_role;
GRANT ALL ON public.swychr_airtime_transactions TO service_role;

ALTER TABLE public.swychr_payin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swychr_payout_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swychr_cardholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swychr_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swychr_airtime_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own swychr payin"
  ON public.swychr_payin_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own swychr payin"
  ON public.swychr_payin_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own swychr payout"
  ON public.swychr_payout_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view own swychr cardholders"
  ON public.swychr_cardholders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users view own swychr cards"
  ON public.swychr_cards FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users view own swychr airtime"
  ON public.swychr_airtime_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_swychr_payin_updated
  BEFORE UPDATE ON public.swychr_payin_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_swychr_payout_updated
  BEFORE UPDATE ON public.swychr_payout_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_swychr_payin_user ON public.swychr_payin_transactions(user_id);
CREATE INDEX idx_swychr_payin_txn ON public.swychr_payin_transactions(transaction_id);
CREATE INDEX idx_swychr_payout_transfer ON public.swychr_payout_transactions(transfer_id);
CREATE INDEX idx_swychr_airtime_user ON public.swychr_airtime_transactions(user_id);

INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
VALUES
  ('1270', 'Swychr Settlement - NGN', 'asset', 'NGN', true, true),
  ('1271', 'Swychr Settlement - GHS', 'asset', 'GHS', true, true),
  ('1272', 'Swychr Settlement - USD', 'asset', 'USD', true, true),
  ('1273', 'Swychr Settlement - XAF', 'asset', 'XAF', true, true),
  ('1274', 'Swychr Settlement - KES', 'asset', 'KES', true, true)
ON CONFLICT (code) DO NOTHING;
