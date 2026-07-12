-- Nomba Nigeria bank rails: bank cache, payout tracking, beneficiary bank_code

CREATE TABLE IF NOT EXISTS public.nomba_banks_cache (
  country varchar(2) PRIMARY KEY DEFAULT 'NG',
  banks jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.nomba_banks_cache TO authenticated;
GRANT ALL ON public.nomba_banks_cache TO service_role;

CREATE TABLE IF NOT EXISTS public.nomba_payout_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reference text NOT NULL,
  provider_reference text,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL DEFAULT 'NGN',
  account_number text NOT NULL,
  bank_code text NOT NULL,
  account_name text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  failure_reason text,
  raw_request jsonb,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.nomba_payout_transactions TO authenticated;
GRANT ALL ON public.nomba_payout_transactions TO service_role;

ALTER TABLE public.nomba_payout_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own nomba payout txns"
  ON public.nomba_payout_transactions FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'finance')
  );

CREATE POLICY "Admins update nomba payout txns"
  ON public.nomba_payout_transactions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_nomba_payout_transactions_updated
  BEFORE UPDATE ON public.nomba_payout_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_nomba_payout_transfer ON public.nomba_payout_transactions(transfer_id);
CREATE INDEX IF NOT EXISTS idx_nomba_payout_status ON public.nomba_payout_transactions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nomba_payout_reference ON public.nomba_payout_transactions(reference);

ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS bank_code text;

CREATE INDEX IF NOT EXISTS beneficiaries_bank_code_idx
  ON public.beneficiaries(user_id, bank_code)
  WHERE bank_code IS NOT NULL;

INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
VALUES ('1264', 'Nomba Payout Float - NGN', 'asset', 'NGN', true, true)
ON CONFLICT (code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
