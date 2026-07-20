-- Pending CAD Interac e-Transfer top-up intents (platform shared alias + amount matching).
CREATE TABLE IF NOT EXISTS public.fincra_cad_interac_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL DEFAULT 'CAD',
  reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired', 'cancelled')),
  provider_reference text,
  credited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours')
);

CREATE INDEX IF NOT EXISTS fincra_cad_interac_intents_pending_amount_idx
  ON public.fincra_cad_interac_intents (status, amount, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS fincra_cad_interac_intents_user_idx
  ON public.fincra_cad_interac_intents (user_id, created_at DESC);

ALTER TABLE public.fincra_cad_interac_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own CAD Interac intents"
  ON public.fincra_cad_interac_intents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.fincra_cad_interac_intents IS
  'User-declared CAD Interac top-up amounts; matched to inbound Fincra collection webhooks.';
