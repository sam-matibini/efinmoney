-- Paytota UGX MoMo payout tracking

CREATE TABLE public.paytota_payout_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reference text NOT NULL UNIQUE,
  provider_payout_id text UNIQUE,
  execution_url text,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency varchar(3) NOT NULL,
  phone text NOT NULL,
  country_code varchar(3) NOT NULL DEFAULT 'UG',
  network text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  failure_reason text,
  provider_reference text,
  raw_request jsonb,
  raw_response jsonb,
  last_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_paytota_payout_transfer ON public.paytota_payout_transactions(transfer_id);
CREATE INDEX idx_paytota_payout_provider ON public.paytota_payout_transactions(provider_payout_id);
CREATE INDEX idx_paytota_payout_status ON public.paytota_payout_transactions(status);

GRANT SELECT ON public.paytota_payout_transactions TO authenticated;
GRANT ALL ON public.paytota_payout_transactions TO service_role;

ALTER TABLE public.paytota_payout_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY paytota_payout_select_own ON public.paytota_payout_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE OR REPLACE FUNCTION public.set_paytota_payout_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_paytota_payout_updated
  BEFORE UPDATE ON public.paytota_payout_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_paytota_payout_updated_at();
