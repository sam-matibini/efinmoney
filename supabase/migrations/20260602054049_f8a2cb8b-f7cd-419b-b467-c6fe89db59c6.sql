
-- 1. Ledger account for Circle CPN in-flight USDC settlement
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active)
VALUES ('1208', 'Circle CPN Settlement (USDC)', 'asset', 'USDC', true)
ON CONFLICT (code) DO NOTHING;

-- 2. Columns on transfers for Circle tracking
ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS circle_transfer_id text,
  ADD COLUMN IF NOT EXISTS circle_quote_id text,
  ADD COLUMN IF NOT EXISTS circle_status text,
  ADD COLUMN IF NOT EXISTS circle_idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS circle_payload jsonb;

CREATE INDEX IF NOT EXISTS idx_transfers_circle_transfer_id ON public.transfers(circle_transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfers_circle_status ON public.transfers(circle_status);

-- 3. CPN corridors table
CREATE TABLE IF NOT EXISTS public.cpn_corridors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_currency varchar(10) NOT NULL,
  dest_country varchar(2) NOT NULL,
  dest_currency varchar(10) NOT NULL,
  payout_method varchar(20) NOT NULL DEFAULT 'bank',
  enabled boolean NOT NULL DEFAULT false,
  min_amount numeric(20,2) NOT NULL DEFAULT 1,
  max_amount numeric(20,2) NOT NULL DEFAULT 10000,
  est_minutes int NOT NULL DEFAULT 60,
  markup_bps int NOT NULL DEFAULT 75,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_currency, dest_country, dest_currency, payout_method)
);

GRANT SELECT ON public.cpn_corridors TO authenticated;
GRANT ALL ON public.cpn_corridors TO service_role;

ALTER TABLE public.cpn_corridors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read corridors"
  ON public.cpn_corridors FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage corridors"
  ON public.cpn_corridors FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER cpn_corridors_updated_at
  BEFORE UPDATE ON public.cpn_corridors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Circle webhook event dedupe table
CREATE TABLE IF NOT EXISTS public.circle_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.circle_webhook_events TO service_role;

ALTER TABLE public.circle_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view circle webhook events"
  ON public.circle_webhook_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Seed starter corridors (disabled by default; admin toggles on)
INSERT INTO public.cpn_corridors (source_currency, dest_country, dest_currency, payout_method, enabled, min_amount, max_amount, est_minutes, markup_bps)
VALUES
  ('USD', 'MX', 'MXN', 'bank', false, 5, 5000, 30, 75),
  ('USD', 'BR', 'BRL', 'bank', false, 5, 5000, 30, 75),
  ('USD', 'PH', 'PHP', 'bank', false, 5, 5000, 60, 90),
  ('USD', 'CO', 'COP', 'bank', false, 5, 5000, 60, 90),
  ('EUR', 'DE', 'EUR', 'bank', false, 5, 10000, 120, 50),
  ('USD', 'IN', 'INR', 'bank', false, 5, 5000, 120, 90)
ON CONFLICT (source_currency, dest_country, dest_currency, payout_method) DO NOTHING;
