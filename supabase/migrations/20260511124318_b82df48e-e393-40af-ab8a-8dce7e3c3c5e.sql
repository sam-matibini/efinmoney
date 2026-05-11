
-- Virtual accounts
CREATE TYPE public.virtual_account_status AS ENUM ('active', 'inactive', 'expired');

CREATE TABLE public.virtual_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  currency_code varchar(10) NOT NULL,
  account_number text NOT NULL UNIQUE,
  bank_name text NOT NULL,
  account_name text NOT NULL,
  flw_order_ref text,
  flw_response jsonb,
  is_permanent boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  status public.virtual_account_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_virtual_accounts_user ON public.virtual_accounts(user_id);
CREATE INDEX idx_virtual_accounts_wallet ON public.virtual_accounts(wallet_id);

ALTER TABLE public.virtual_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own virtual accounts" ON public.virtual_accounts
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin_user(auth.uid()));
CREATE POLICY "Admins manage virtual accounts" ON public.virtual_accounts
  FOR ALL USING (public.is_admin_user(auth.uid())) WITH CHECK (public.is_admin_user(auth.uid()));

CREATE TRIGGER update_virtual_accounts_updated_at BEFORE UPDATE ON public.virtual_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bill payments
CREATE TABLE public.bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wallet_id uuid REFERENCES public.wallets(id),
  category text NOT NULL,
  biller_code text NOT NULL,
  biller_name text,
  customer_identifier text NOT NULL,
  amount numeric(20,2) NOT NULL,
  currency varchar(10) NOT NULL,
  fee numeric(20,2) NOT NULL DEFAULT 0,
  reference text NOT NULL UNIQUE,
  flw_reference text,
  token text,
  units text,
  status text NOT NULL DEFAULT 'pending',
  flw_response jsonb,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bill_payments_user ON public.bill_payments(user_id);

ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own bill payments" ON public.bill_payments
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin_user(auth.uid()));
CREATE POLICY "Admins manage bill payments" ON public.bill_payments
  FOR ALL USING (public.is_admin_user(auth.uid())) WITH CHECK (public.is_admin_user(auth.uid()));

CREATE TRIGGER update_bill_payments_updated_at BEFORE UPDATE ON public.bill_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Webhook logs
CREATE TABLE public.flw_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text,
  payload jsonb,
  processed boolean NOT NULL DEFAULT false,
  error text,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.flw_webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view webhook logs" ON public.flw_webhook_logs
  FOR SELECT USING (public.is_admin_user(auth.uid()));

-- Caches
CREATE TABLE public.flw_banks_cache (
  country text PRIMARY KEY,
  banks jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.flw_banks_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read banks cache" ON public.flw_banks_cache
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.flw_billers_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL,
  category text,
  billers jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(country, category)
);
ALTER TABLE public.flw_billers_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read billers cache" ON public.flw_billers_cache
  FOR SELECT TO authenticated USING (true);
