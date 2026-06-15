
-- Status enum for payment link payouts
DO $$ BEGIN
  CREATE TYPE public.payment_link_status AS ENUM ('pending','claimed','expired','revoked','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_link_source AS ENUM ('send','invoice');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_link_claim_method AS ENUM ('interac','card_push','eft');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.payment_link_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  sender_wallet_id uuid,
  source public.payment_link_source NOT NULL DEFAULT 'send',
  source_ref uuid,
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  currency varchar(10) NOT NULL,
  recipient_name text,
  recipient_note text,
  short_code text NOT NULL UNIQUE,
  short_url text,
  status public.payment_link_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  escrow_journal_id uuid,
  release_journal_id uuid,
  reversal_journal_id uuid,
  claimed_method public.payment_link_claim_method,
  claimed_payload jsonb,
  claimed_at timestamptz,
  claimed_ip text,
  transfer_id uuid,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_link_payouts_sender_idx ON public.payment_link_payouts (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_link_payouts_status_idx ON public.payment_link_payouts (status, expires_at);
CREATE INDEX IF NOT EXISTS payment_link_payouts_short_code_idx ON public.payment_link_payouts (short_code);

GRANT SELECT, INSERT, UPDATE ON public.payment_link_payouts TO authenticated;
GRANT ALL ON public.payment_link_payouts TO service_role;

ALTER TABLE public.payment_link_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Senders can view own links"
  ON public.payment_link_payouts FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Senders can insert own links"
  ON public.payment_link_payouts FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Senders can update own pending links"
  ON public.payment_link_payouts FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() AND status = 'pending')
  WITH CHECK (sender_id = auth.uid());

CREATE TRIGGER payment_link_payouts_updated_at
  BEFORE UPDATE ON public.payment_link_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Chart of accounts: Payouts Pending Claim per currency
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active)
VALUES
  ('2199','Payouts Pending Claim - CAD','liability','CAD',true),
  ('2199','Payouts Pending Claim - USD','liability','USD',true),
  ('2199','Payouts Pending Claim - EUR','liability','EUR',true),
  ('2199','Payouts Pending Claim - GBP','liability','GBP',true)
ON CONFLICT DO NOTHING;
