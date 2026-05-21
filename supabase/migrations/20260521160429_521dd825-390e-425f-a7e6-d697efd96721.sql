
-- Enums
CREATE TYPE public.cardholder_type AS ENUM ('individual', 'company');
CREATE TYPE public.cardholder_status AS ENUM ('active', 'inactive', 'blocked');
CREATE TYPE public.issued_card_status AS ENUM ('active', 'frozen', 'cancelled', 'pending');
CREATE TYPE public.issued_card_type AS ENUM ('virtual', 'physical');
CREATE TYPE public.issued_card_purpose AS ENUM ('personal', 'business', 'single_use', 'subscription');
CREATE TYPE public.card_authorization_status AS ENUM ('pending', 'approved', 'declined', 'reversed', 'expired');
CREATE TYPE public.card_funding_source AS ENUM ('wallet', 'eft');
CREATE TYPE public.card_funding_status AS ENUM ('pending', 'completed', 'failed', 'reversed');
CREATE TYPE public.card_fraud_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.business_card_role AS ENUM ('owner', 'admin', 'member');

-- Cardholders
CREATE TABLE public.cardholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_cardholder_id TEXT UNIQUE,
  type public.cardholder_type NOT NULL DEFAULT 'individual',
  legal_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  billing_line1 TEXT NOT NULL,
  billing_line2 TEXT,
  billing_city TEXT NOT NULL,
  billing_state TEXT NOT NULL,
  billing_postal_code TEXT NOT NULL,
  billing_country TEXT NOT NULL DEFAULT 'CA',
  status public.cardholder_status NOT NULL DEFAULT 'active',
  kyc_verified_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cardholders_user ON public.cardholders(user_id);

-- Issued cards
CREATE TABLE public.issued_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cardholder_id UUID NOT NULL REFERENCES public.cardholders(id) ON DELETE RESTRICT,
  stripe_card_id TEXT UNIQUE,
  last4 TEXT,
  brand TEXT NOT NULL DEFAULT 'visa',
  currency VARCHAR(10) NOT NULL DEFAULT 'CAD',
  card_type public.issued_card_type NOT NULL DEFAULT 'virtual',
  purpose public.issued_card_purpose NOT NULL DEFAULT 'personal',
  status public.issued_card_status NOT NULL DEFAULT 'pending',
  nickname TEXT,
  funding_wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  exp_month INT,
  exp_year INT,
  cancelled_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_issued_cards_user ON public.issued_cards(user_id);
CREATE INDEX idx_issued_cards_wallet ON public.issued_cards(funding_wallet_id);

-- Spending controls
CREATE TABLE public.card_spending_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL UNIQUE REFERENCES public.issued_cards(id) ON DELETE CASCADE,
  per_authorization_limit NUMERIC(20,2),
  daily_limit NUMERIC(20,2),
  weekly_limit NUMERIC(20,2),
  monthly_limit NUMERIC(20,2),
  allowed_categories TEXT[],
  blocked_categories TEXT[],
  allowed_countries TEXT[],
  blocked_countries TEXT[],
  single_use BOOLEAN NOT NULL DEFAULT false,
  subscription_lock_merchant TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Authorizations log
CREATE TABLE public.card_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.issued_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_authorization_id TEXT UNIQUE,
  amount NUMERIC(20,2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  merchant_name TEXT,
  merchant_category TEXT,
  merchant_country TEXT,
  status public.card_authorization_status NOT NULL DEFAULT 'pending',
  decline_reason TEXT,
  approved_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_card_auth_card ON public.card_authorizations(card_id);
CREATE INDEX idx_card_auth_user ON public.card_authorizations(user_id);

-- Transactions (settled)
CREATE TABLE public.card_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.issued_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  authorization_id UUID REFERENCES public.card_authorizations(id) ON DELETE SET NULL,
  stripe_transaction_id TEXT UNIQUE,
  amount NUMERIC(20,2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  merchant_name TEXT,
  merchant_category TEXT,
  mcc TEXT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_card_txn_card ON public.card_transactions(card_id);
CREATE INDEX idx_card_txn_user ON public.card_transactions(user_id);

-- Funding events
CREATE TABLE public.card_funding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.issued_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source public.card_funding_source NOT NULL DEFAULT 'wallet',
  source_wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  amount NUMERIC(20,2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  ledger_journal_id UUID,
  status public.card_funding_status NOT NULL DEFAULT 'pending',
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_card_funding_card ON public.card_funding_events(card_id);

-- Fraud signals
CREATE TABLE public.card_fraud_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.issued_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  authorization_id UUID REFERENCES public.card_authorizations(id) ON DELETE SET NULL,
  signal_type TEXT NOT NULL,
  severity public.card_fraud_severity NOT NULL DEFAULT 'low',
  score NUMERIC(5,2),
  details JSONB,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_card_fraud_card ON public.card_fraud_signals(card_id);

-- Business programs
CREATE TABLE public.business_card_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  default_currency VARCHAR(10) NOT NULL DEFAULT 'CAD',
  funding_wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_biz_program_owner ON public.business_card_programs(owner_user_id);

CREATE TABLE public.business_card_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.business_card_programs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.business_card_role NOT NULL DEFAULT 'member',
  department TEXT,
  per_member_monthly_cap NUMERIC(20,2),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(program_id, user_id)
);
CREATE INDEX idx_biz_member_program ON public.business_card_members(program_id);
CREATE INDEX idx_biz_member_user ON public.business_card_members(user_id);

-- Triggers for updated_at
CREATE TRIGGER trg_cardholders_updated BEFORE UPDATE ON public.cardholders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_issued_cards_updated BEFORE UPDATE ON public.issued_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_card_controls_updated BEFORE UPDATE ON public.card_spending_controls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_biz_program_updated BEFORE UPDATE ON public.business_card_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: is_business_program_owner
CREATE OR REPLACE FUNCTION public.is_business_program_owner(_program_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_card_programs
    WHERE id = _program_id AND owner_user_id = _user_id
  );
$$;

-- Enable RLS
ALTER TABLE public.cardholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_spending_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_funding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_fraud_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_card_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_card_members ENABLE ROW LEVEL SECURITY;

-- Cardholders policies
CREATE POLICY "cardholders self read" ON public.cardholders FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cardholders self insert" ON public.cardholders FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cardholders self update" ON public.cardholders FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Issued cards policies
CREATE POLICY "issued_cards self read" ON public.issued_cards FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "issued_cards self insert" ON public.issued_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "issued_cards self update" ON public.issued_cards FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Spending controls policies
CREATE POLICY "card_controls owner read" ON public.card_spending_controls FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.issued_cards c WHERE c.id = card_id AND (c.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "card_controls owner write" ON public.card_spending_controls FOR ALL
  USING (EXISTS (SELECT 1 FROM public.issued_cards c WHERE c.id = card_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.issued_cards c WHERE c.id = card_id AND c.user_id = auth.uid()));

-- Authorizations: read-only for users
CREATE POLICY "card_auth self read" ON public.card_authorizations FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Transactions: read-only for users
CREATE POLICY "card_txn self read" ON public.card_transactions FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Funding events
CREATE POLICY "card_funding self read" ON public.card_funding_events FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "card_funding self insert" ON public.card_funding_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Fraud signals: read-only
CREATE POLICY "card_fraud self read" ON public.card_fraud_signals FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Business programs
CREATE POLICY "biz_program owner read" ON public.business_card_programs FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.business_card_members m WHERE m.program_id = id AND m.user_id = auth.uid())
  );
CREATE POLICY "biz_program owner write" ON public.business_card_programs FOR ALL
  USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

-- Business members
CREATE POLICY "biz_member visible" ON public.business_card_members FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_business_program_owner(program_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "biz_member owner write" ON public.business_card_members FOR ALL
  USING (public.is_business_program_owner(program_id, auth.uid()))
  WITH CHECK (public.is_business_program_owner(program_id, auth.uid()));
