-- Restore missing DB objects. Retry with existing is_admin_user() helper.

CREATE TABLE IF NOT EXISTS public.staff_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.staff_audit_log TO authenticated;
GRANT ALL ON public.staff_audit_log TO service_role;
ALTER TABLE public.staff_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active admins read staff audit" ON public.staff_audit_log;
CREATE POLICY "Active admins read staff audit"
  ON public.staff_audit_log FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_staff_audit_log_target_created
  ON public.staff_audit_log(target_admin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.swychr_payin_transactions (
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
GRANT SELECT, INSERT, UPDATE ON public.swychr_payin_transactions TO authenticated;
GRANT ALL ON public.swychr_payin_transactions TO service_role;
ALTER TABLE public.swychr_payin_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own swychr payin" ON public.swychr_payin_transactions;
CREATE POLICY "Users view own swychr payin"
  ON public.swychr_payin_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Users insert own swychr payin" ON public.swychr_payin_transactions;
CREATE POLICY "Users insert own swychr payin"
  ON public.swychr_payin_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.swychr_payout_transactions (
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
GRANT SELECT, INSERT, UPDATE ON public.swychr_payout_transactions TO authenticated;
GRANT ALL ON public.swychr_payout_transactions TO service_role;
ALTER TABLE public.swychr_payout_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own swychr payout" ON public.swychr_payout_transactions;
CREATE POLICY "Users view own swychr payout"
  ON public.swychr_payout_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.swychr_cardholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  swychr_user_id text NOT NULL,
  email text,
  raw_profile jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.swychr_cardholders TO authenticated;
GRANT ALL ON public.swychr_cardholders TO service_role;
ALTER TABLE public.swychr_cardholders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own swychr cardholders" ON public.swychr_cardholders;
CREATE POLICY "Users view own swychr cardholders"
  ON public.swychr_cardholders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.swychr_cards (
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
GRANT SELECT, INSERT, UPDATE ON public.swychr_cards TO authenticated;
GRANT ALL ON public.swychr_cards TO service_role;
ALTER TABLE public.swychr_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own swychr cards" ON public.swychr_cards;
CREATE POLICY "Users view own swychr cards"
  ON public.swychr_cards FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.swychr_airtime_transactions (
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
GRANT SELECT, INSERT, UPDATE ON public.swychr_airtime_transactions TO authenticated;
GRANT ALL ON public.swychr_airtime_transactions TO service_role;
ALTER TABLE public.swychr_airtime_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own swychr airtime" ON public.swychr_airtime_transactions;
CREATE POLICY "Users view own swychr airtime"
  ON public.swychr_airtime_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_swychr_payin_updated ON public.swychr_payin_transactions;
CREATE TRIGGER trg_swychr_payin_updated
  BEFORE UPDATE ON public.swychr_payin_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_swychr_payout_updated ON public.swychr_payout_transactions;
CREATE TRIGGER trg_swychr_payout_updated
  BEFORE UPDATE ON public.swychr_payout_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_swychr_payin_user ON public.swychr_payin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_swychr_payin_txn ON public.swychr_payin_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_swychr_payout_transfer ON public.swychr_payout_transactions(transfer_id);
CREATE INDEX IF NOT EXISTS idx_swychr_airtime_user ON public.swychr_airtime_transactions(user_id);

CREATE OR REPLACE FUNCTION public.sweep_fx_clearing_to_gain_loss()
RETURNS TABLE(swept_currency varchar, swept_amount numeric, posted_to text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_journal_id uuid := gen_random_uuid();
  v_ref_prefix text := 'fx-sweep-' || to_char(now(), 'YYYYMMDDHH24MISS');
  v_gain_account uuid;
  v_loss_account uuid;
BEGIN
  IF v_caller IS NULL OR NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'finance')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT id INTO v_gain_account FROM public.ledger_accounts WHERE code = '4100';
  SELECT id INTO v_loss_account FROM public.ledger_accounts WHERE code = '5100';
  IF v_gain_account IS NULL OR v_loss_account IS NULL THEN
    RAISE EXCEPTION 'FX Gain (4100) / FX Loss (5100) accounts not found';
  END IF;
  CREATE TEMP TABLE _fx_sweep_clearing ON COMMIT DROP AS
    SELECT la.id AS account_id, la.currency_code AS ccy,
           ROUND((SUM(le.debit_amount) - SUM(le.credit_amount))::numeric, 2) AS balance
      FROM public.ledger_accounts la
      JOIN public.ledger_entries le ON le.account_id = la.id
     WHERE la.name LIKE 'FX Clearing - %'
     GROUP BY la.id, la.currency_code
    HAVING ABS(SUM(le.debit_amount) - SUM(le.credit_amount)) > 0.005;
  IF NOT EXISTS (SELECT 1 FROM _fx_sweep_clearing) THEN
    RETURN;
  END IF;
  INSERT INTO public.ledger_entries
    (journal_id, account_id, currency_code, debit_amount, credit_amount, description, reference_type, external_reference, created_by)
  SELECT v_journal_id, account_id, ccy,
         CASE WHEN balance < 0 THEN ABS(balance) ELSE 0 END,
         CASE WHEN balance > 0 THEN balance ELSE 0 END,
         'FX Clearing sweep — realized', 'fx_clearing_sweep', v_ref_prefix || '-' || ccy || '-clr', v_caller
    FROM _fx_sweep_clearing
  UNION ALL
  SELECT v_journal_id,
         CASE WHEN balance > 0 THEN v_loss_account ELSE v_gain_account END,
         ccy,
         CASE WHEN balance > 0 THEN balance ELSE 0 END,
         CASE WHEN balance < 0 THEN ABS(balance) ELSE 0 END,
         'FX Clearing sweep — realized', 'fx_clearing_sweep', v_ref_prefix || '-' || ccy || '-pl', v_caller
    FROM _fx_sweep_clearing;
  RETURN QUERY
    SELECT ccy, ABS(balance), (CASE WHEN balance > 0 THEN 'FX Loss' ELSE 'FX Gain' END)::text
      FROM _fx_sweep_clearing;
END;
$$;
REVOKE ALL ON FUNCTION public.sweep_fx_clearing_to_gain_loss() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_fx_clearing_to_gain_loss() TO authenticated;

INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active)
VALUES
  ('1270', 'Swychr Settlement - NGN', 'asset', 'NGN', true),
  ('1271', 'Swychr Settlement - GHS', 'asset', 'GHS', true),
  ('1272', 'Swychr Settlement - USD', 'asset', 'USD', true),
  ('1273', 'Swychr Settlement - XAF', 'asset', 'XAF', true),
  ('1274', 'Swychr Settlement - KES', 'asset', 'KES', true)
ON CONFLICT (code) DO NOTHING;