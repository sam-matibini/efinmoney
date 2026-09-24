-- Fincra USD collect (card + bank VA) and payout (ACH/SWIFT Fincra-first → Nomba).

-- Collect: prefer Fincra card; Square/PayPal failover
UPDATE public.corridor_rail_policies
SET
  preferred_partner = 'fincra',
  failover_partners = ARRAY['square', 'paypal'],
  enabled = true,
  notes = 'USD collect: Fincra card checkout first; Square/PayPal failover',
  updated_at = now()
WHERE direction = 'collect'
  AND country_code = 'US'
  AND currency_code = 'USD';

INSERT INTO public.corridor_rail_policies (
  direction, country_code, currency_code, preferred_partner, failover_partners, enabled, notes
)
SELECT
  'collect', 'US', 'USD', 'fincra', ARRAY['square', 'paypal'], true,
  'USD collect: Fincra card checkout first; Square/PayPal failover'
WHERE NOT EXISTS (
  SELECT 1 FROM public.corridor_rail_policies
  WHERE direction = 'collect' AND country_code = 'US' AND currency_code = 'USD'
);

-- Payout: Fincra ACH/SWIFT first, Nomba failover
UPDATE public.corridor_rail_policies
SET
  preferred_partner = 'fincra',
  failover_partners = ARRAY['nomba'],
  enabled = true,
  notes = 'USD ACH/SWIFT: Fincra first, Nomba failover',
  updated_at = now()
WHERE direction = 'payout'
  AND country_code = 'US'
  AND currency_code = 'USD';

INSERT INTO public.corridor_rail_policies (
  direction, country_code, currency_code, preferred_partner, failover_partners, enabled, notes
)
SELECT
  'payout', 'US', 'USD', 'fincra', ARRAY['nomba'], true,
  'USD ACH/SWIFT: Fincra first, Nomba failover'
WHERE NOT EXISTS (
  SELECT 1 FROM public.corridor_rail_policies
  WHERE direction = 'payout' AND country_code = 'US' AND currency_code = 'USD'
);

-- USD bank-receive intents (Fincra VA / ACH deposit), mirror CAD Interac intents
CREATE SEQUENCE IF NOT EXISTS public.usd_bank_intent_seq;

CREATE OR REPLACE FUNCTION public.next_usd_bank_public_id()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'EFMU-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.usd_bank_intent_seq')::text, 8, '0');
$$;

GRANT EXECUTE ON FUNCTION public.next_usd_bank_public_id() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.fincra_usd_bank_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency_code text NOT NULL DEFAULT 'USD',
  reference text NOT NULL UNIQUE,
  public_id text NOT NULL DEFAULT public.next_usd_bank_public_id(),
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN (
      'pending', 'awaiting_payment', 'claimed_sent', 'settled', 'completed',
      'expired', 'cancelled', 'failed'
    )),
  provider_reference text,
  customer_name text,
  customer_email text,
  purpose text DEFAULT 'topup',
  transfer_id uuid,
  match_tier text,
  credited_at timestamptz,
  claimed_sent_at timestamptz,
  received_at timestamptz,
  matched_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours')
);

CREATE UNIQUE INDEX IF NOT EXISTS fincra_usd_bank_intents_public_id_key
  ON public.fincra_usd_bank_intents (public_id);

CREATE INDEX IF NOT EXISTS fincra_usd_bank_intents_pending_amount_idx
  ON public.fincra_usd_bank_intents (status, amount, created_at DESC)
  WHERE status IN ('pending', 'awaiting_payment', 'claimed_sent');

CREATE INDEX IF NOT EXISTS fincra_usd_bank_intents_user_idx
  ON public.fincra_usd_bank_intents (user_id, created_at DESC);

ALTER TABLE public.fincra_usd_bank_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own USD bank intents" ON public.fincra_usd_bank_intents;
CREATE POLICY "Users can read own USD bank intents"
  ON public.fincra_usd_bank_intents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.fincra_usd_bank_intents IS
  'User-declared USD bank-receive top-ups via Fincra VA; matched to inbound collection webhooks.';
