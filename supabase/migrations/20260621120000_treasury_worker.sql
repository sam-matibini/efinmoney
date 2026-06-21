-- Treasury settlement worker: provider balance snapshots, settlement jobs
-- Note: pending_liquidity enum value is added in 20260621115900_treasury_worker_pending_liquidity_enum.sql

CREATE TABLE IF NOT EXISTS public.treasury_provider_balances (  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  currency TEXT NOT NULL,
  available_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  pending_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  raw JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, currency)
);

CREATE TABLE IF NOT EXISTS public.treasury_settlement_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corridor TEXT NOT NULL DEFAULT 'stripe_flw_ngn',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'stripe_payout_initiated',
      'awaiting_flw_credit',
      'completed',
      'failed',
      'cancelled'
    )),
  source_provider TEXT NOT NULL DEFAULT 'stripe',
  dest_provider TEXT NOT NULL DEFAULT 'flutterwave',
  source_currency TEXT NOT NULL DEFAULT 'USD',
  dest_currency TEXT NOT NULL DEFAULT 'NGN',
  source_amount NUMERIC(18, 2),
  dest_amount_needed NUMERIC(18, 2) NOT NULL,
  dest_amount_filled NUMERIC(18, 2) NOT NULL DEFAULT 0,
  stripe_payout_id TEXT,
  external_reference TEXT,
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS treasury_settlement_jobs_status_idx
  ON public.treasury_settlement_jobs (status, created_at DESC);

GRANT SELECT ON public.treasury_provider_balances TO authenticated;
GRANT SELECT ON public.treasury_settlement_jobs TO authenticated;
GRANT ALL ON public.treasury_provider_balances TO service_role;
GRANT ALL ON public.treasury_settlement_jobs TO service_role;

ALTER TABLE public.treasury_provider_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_settlement_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance staff read provider balances"
  ON public.treasury_provider_balances FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'finance')
    )
  );

CREATE POLICY "finance staff read settlement jobs"
  ON public.treasury_settlement_jobs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'finance')
    )
  );

CREATE TRIGGER treasury_settlement_jobs_updated
  BEFORE UPDATE ON public.treasury_settlement_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
