-- Request Money: shareable pay-in link (third party bank/Interac → requester wallet).
-- No escrow on create; credit happens when Fincra CAD Interac (or later rails) settles.

DO $$ BEGIN
  CREATE TYPE public.money_request_status AS ENUM (
    'pending',
    'awaiting_payment',
    'paid',
    'expired',
    'cancelled',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.money_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_wallet_id uuid NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  amount numeric(20, 2) NOT NULL CHECK (amount > 0),
  currency varchar(10) NOT NULL,
  short_code text NOT NULL UNIQUE,
  short_url text,
  status public.money_request_status NOT NULL DEFAULT 'pending',
  note text,
  payer_hint_name text,
  payer_name text,
  payer_email text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  fincra_intent_id uuid,
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS money_requests_requester_idx
  ON public.money_requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS money_requests_status_idx
  ON public.money_requests (status, expires_at);
CREATE INDEX IF NOT EXISTS money_requests_short_code_idx
  ON public.money_requests (short_code);

ALTER TABLE public.money_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.money_requests TO authenticated;
GRANT ALL ON public.money_requests TO service_role;

CREATE POLICY "Requesters can view own money requests"
  ON public.money_requests FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Requesters can insert own money requests"
  ON public.money_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Requesters can update own open money requests"
  ON public.money_requests FOR UPDATE TO authenticated
  USING (
    requester_id = auth.uid()
    AND status IN ('pending', 'awaiting_payment')
  )
  WITH CHECK (requester_id = auth.uid());

DROP TRIGGER IF EXISTS money_requests_updated_at ON public.money_requests;
CREATE TRIGGER money_requests_updated_at
  BEFORE UPDATE ON public.money_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link Interac intents to money requests (service role writes; users read own intents).
ALTER TABLE public.fincra_cad_interac_intents
  ADD COLUMN IF NOT EXISTS money_request_id uuid REFERENCES public.money_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fincra_cad_interac_intents_money_request_idx
  ON public.fincra_cad_interac_intents (money_request_id)
  WHERE money_request_id IS NOT NULL;

-- Allow purpose = money_request on CAD Interac intents
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.fincra_cad_interac_intents'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%purpose%'
  LOOP
    EXECUTE format('ALTER TABLE public.fincra_cad_interac_intents DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.fincra_cad_interac_intents
  ADD CONSTRAINT fincra_cad_interac_intents_purpose_check
  CHECK (purpose IN ('topup', 'transfer', 'merchant_collection', 'money_request'));
