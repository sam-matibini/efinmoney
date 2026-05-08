
-- Plaid linked items (one row per linked bank login)
CREATE TABLE public.plaid_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL UNIQUE,
  access_token text NOT NULL,
  institution_id text,
  institution_name text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plaid_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own plaid items" ON public.plaid_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users delete own plaid items" ON public.plaid_items
  FOR DELETE USING (auth.uid() = user_id);

-- Cached account info per linked item
CREATE TABLE public.plaid_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.plaid_items(id) ON DELETE CASCADE,
  plaid_account_id text NOT NULL,
  name text NOT NULL,
  official_name text,
  mask text,
  subtype text,
  type text,
  -- Canadian EFT routing numbers (from Plaid Auth numbers.eft)
  institution_number text,
  branch_number text,
  account_number text,
  currency_code text DEFAULT 'CAD',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id, plaid_account_id)
);

ALTER TABLE public.plaid_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own plaid accounts" ON public.plaid_accounts
  FOR SELECT USING (auth.uid() = user_id);

-- Intra-Canada transfers (bank -> wallet via Plaid + Stripe PAD)
CREATE TABLE public.intra_ca_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference text NOT NULL UNIQUE DEFAULT ('EFM-CA-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  plaid_account_id uuid REFERENCES public.plaid_accounts(id),
  destination_wallet_id uuid REFERENCES public.wallets(id),
  amount_cad numeric(20,2) NOT NULL CHECK (amount_cad > 0),
  description text,
  status text NOT NULL DEFAULT 'initiated', -- initiated | processing | completed | failed
  stripe_payment_intent_id text,
  stripe_status text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.intra_ca_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ca transfers" ON public.intra_ca_transfers
  FOR SELECT USING (auth.uid() = user_id);

CREATE TRIGGER trg_plaid_items_updated
  BEFORE UPDATE ON public.plaid_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_intra_ca_transfers_updated
  BEFORE UPDATE ON public.intra_ca_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_plaid_items_user ON public.plaid_items(user_id);
CREATE INDEX idx_plaid_accounts_user ON public.plaid_accounts(user_id);
CREATE INDEX idx_intra_ca_transfers_user ON public.intra_ca_transfers(user_id);
