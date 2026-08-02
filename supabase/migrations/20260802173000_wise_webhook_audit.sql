-- Wise webhook audit + balance credit/debit events for full deposit testing.
-- provider_webhook_logs: generic raw payloads (Wise, etc.)
-- wise_balance_events: structured balances#credit / balances#update rows

CREATE TABLE IF NOT EXISTS public.provider_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text,
  external_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_webhook_logs_provider_received
  ON public.provider_webhook_logs (provider, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_webhook_logs_event
  ON public.provider_webhook_logs (event_type);

ALTER TABLE public.provider_webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read provider_webhook_logs" ON public.provider_webhook_logs;
CREATE POLICY "Staff read provider_webhook_logs"
  ON public.provider_webhook_logs FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));

GRANT SELECT ON public.provider_webhook_logs TO authenticated;
GRANT ALL ON public.provider_webhook_logs TO service_role;

CREATE TABLE IF NOT EXISTS public.wise_balance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  subscription_id text,
  profile_id text,
  balance_id text,
  transaction_type text,
  amount numeric,
  currency text,
  post_balance numeric,
  occurred_at timestamptz,
  transfer_reference text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wise_balance_events_occurred
  ON public.wise_balance_events (occurred_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_wise_balance_events_currency
  ON public.wise_balance_events (currency, transaction_type);

ALTER TABLE public.wise_balance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read wise_balance_events" ON public.wise_balance_events;
CREATE POLICY "Staff read wise_balance_events"
  ON public.wise_balance_events FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));

GRANT SELECT ON public.wise_balance_events TO authenticated;
GRANT ALL ON public.wise_balance_events TO service_role;
