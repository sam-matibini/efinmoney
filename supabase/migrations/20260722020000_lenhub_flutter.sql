-- Lenhub Flutter (/app/flutter) charge + payout tracking
CREATE TABLE IF NOT EXISTS public.lenhub_flutter_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  currency_code text NOT NULL,
  amount numeric(18, 2) NOT NULL,
  email text,
  charge_id text,
  status text NOT NULL DEFAULT 'pending',
  next_action text,
  provider_response jsonb,
  credited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lenhub_flutter_charges_user ON public.lenhub_flutter_charges(user_id);
CREATE INDEX IF NOT EXISTS idx_lenhub_flutter_charges_charge ON public.lenhub_flutter_charges(charge_id);

CREATE TABLE IF NOT EXISTS public.lenhub_flutter_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid REFERENCES public.transfers(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_currency text NOT NULL,
  destination_currency text NOT NULL,
  amount numeric(18, 2) NOT NULL,
  rail text NOT NULL,
  provider_reference text,
  status text NOT NULL DEFAULT 'processing',
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lenhub_flutter_payouts_transfer ON public.lenhub_flutter_payouts(transfer_id);

ALTER TABLE public.lenhub_flutter_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lenhub_flutter_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own lenhub flutter charges"
  ON public.lenhub_flutter_charges FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users read own lenhub flutter payouts"
  ON public.lenhub_flutter_payouts FOR SELECT
  USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.lenhub_flutter_charges TO postgres, service_role;
GRANT ALL ON TABLE public.lenhub_flutter_payouts TO postgres, service_role;
GRANT SELECT ON TABLE public.lenhub_flutter_charges TO authenticated;
GRANT SELECT ON TABLE public.lenhub_flutter_payouts TO authenticated;
