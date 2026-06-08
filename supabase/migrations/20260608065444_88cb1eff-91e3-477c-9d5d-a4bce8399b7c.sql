
-- ============================================================
-- Stripe Treasury: tables, COA, RLS
-- ============================================================

-- 1) Financial Accounts mirror
CREATE TABLE IF NOT EXISTS public.treasury_financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_fa_id TEXT NOT NULL UNIQUE,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('platform','user')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_account_id TEXT,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  aba_routing TEXT,
  account_number_last4 TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  balance_available NUMERIC(20,2) NOT NULL DEFAULT 0,
  balance_pending NUMERIC(20,2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS treasury_fa_user_idx ON public.treasury_financial_accounts(user_id);
CREATE INDEX IF NOT EXISTS treasury_fa_owner_idx ON public.treasury_financial_accounts(owner_kind);

GRANT SELECT ON public.treasury_financial_accounts TO authenticated;
GRANT ALL ON public.treasury_financial_accounts TO service_role;
ALTER TABLE public.treasury_financial_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own treasury fa" ON public.treasury_financial_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finance')
  );

CREATE TRIGGER treasury_fa_updated BEFORE UPDATE ON public.treasury_financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Unified transfers table (inbound, outbound, payment)
CREATE TABLE IF NOT EXISTS public.treasury_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fa_id UUID NOT NULL REFERENCES public.treasury_financial_accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('inbound_transfer','outbound_transfer','outbound_payment','issuing_funding')),
  stripe_id TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  amount NUMERIC(20,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  network TEXT CHECK (network IN ('ach','us_domestic_wire','stripe','internal')),
  status TEXT NOT NULL DEFAULT 'processing',
  counterparty JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason TEXT,
  description TEXT,
  journal_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS treasury_transfers_user_idx ON public.treasury_transfers(user_id);
CREATE INDEX IF NOT EXISTS treasury_transfers_fa_idx ON public.treasury_transfers(fa_id);
CREATE INDEX IF NOT EXISTS treasury_transfers_status_idx ON public.treasury_transfers(status);

GRANT SELECT ON public.treasury_transfers TO authenticated;
GRANT ALL ON public.treasury_transfers TO service_role;
ALTER TABLE public.treasury_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own treasury transfers" ON public.treasury_transfers
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finance')
  );

CREATE TRIGGER treasury_transfers_updated BEFORE UPDATE ON public.treasury_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Received entries feed
CREATE TABLE IF NOT EXISTS public.treasury_received_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fa_id UUID NOT NULL REFERENCES public.treasury_financial_accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('received_credit','received_debit')),
  amount NUMERIC(20,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'succeeded',
  network TEXT,
  counterparty JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS treasury_received_user_idx ON public.treasury_received_entries(user_id);
CREATE INDEX IF NOT EXISTS treasury_received_fa_idx ON public.treasury_received_entries(fa_id);

GRANT SELECT ON public.treasury_received_entries TO authenticated;
GRANT ALL ON public.treasury_received_entries TO service_role;
ALTER TABLE public.treasury_received_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own treasury received" ON public.treasury_received_entries
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finance')
  );

CREATE TRIGGER treasury_received_updated BEFORE UPDATE ON public.treasury_received_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Webhook idempotency
CREATE TABLE IF NOT EXISTS public.treasury_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.treasury_webhook_events TO authenticated;
GRANT ALL ON public.treasury_webhook_events TO service_role;
ALTER TABLE public.treasury_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin view treasury webhook events" ON public.treasury_webhook_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5) Chart of Accounts additions
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code)
VALUES
  ('1270', 'Stripe Treasury - USD',           'asset',     'USD'),
  ('1271', 'Stripe Treasury In-Transit - USD','asset',     'USD'),
  ('2120', 'Customer Treasury Liability - USD','liability','USD')
ON CONFLICT (code) DO NOTHING;
