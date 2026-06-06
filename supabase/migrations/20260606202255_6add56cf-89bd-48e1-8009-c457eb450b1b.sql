
CREATE TABLE IF NOT EXISTS public.crossmint_yellowcard_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_currency varchar(10) NOT NULL,
  source_amount numeric(20,2) NOT NULL CHECK (source_amount > 0),
  destination_currency varchar(10) NOT NULL,
  destination_amount numeric(20,2),
  destination_country varchar(2) NOT NULL,
  recipient_name text NOT NULL,
  recipient_bank_name text,
  recipient_bank_code text,
  recipient_account_number text NOT NULL,
  recipient_phone text,
  recipient_email text,
  fx_rate numeric(20,8),
  fee_amount numeric(20,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','card_charged','usdc_received','payout_sent','success','failed','cancelled','pending_payout')),
  crossmint_order_id text UNIQUE,
  crossmint_checkout_url text,
  crossmint_raw jsonb,
  stellar_tx_hash text,
  yellowcard_payment_id text,
  yellowcard_raw jsonb,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmyc_user ON public.crossmint_yellowcard_transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_cmyc_status ON public.crossmint_yellowcard_transfers(status);
CREATE INDEX IF NOT EXISTS idx_cmyc_order ON public.crossmint_yellowcard_transfers(crossmint_order_id);

GRANT SELECT, INSERT, UPDATE ON public.crossmint_yellowcard_transfers TO authenticated;
GRANT ALL ON public.crossmint_yellowcard_transfers TO service_role;

ALTER TABLE public.crossmint_yellowcard_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own cmyc transfers"
  ON public.crossmint_yellowcard_transfers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own cmyc transfers"
  ON public.crossmint_yellowcard_transfers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_cmyc_updated_at
  BEFORE UPDATE ON public.crossmint_yellowcard_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.crossmint_yellowcard_transfers;

-- Generic webhook events log (used by crossmint-webhook and others)
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view webhook events"
  ON public.webhook_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
