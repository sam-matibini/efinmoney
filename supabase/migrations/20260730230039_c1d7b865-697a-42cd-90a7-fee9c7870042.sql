ALTER TABLE public.routing_rules
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'shadow',
  ADD COLUMN IF NOT EXISTS kill_switch BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.partner_corridors
  ADD COLUMN IF NOT EXISTS live_routing_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.routing_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  override_type TEXT NOT NULL DEFAULT 'pin',
  partner_id UUID NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'payout',
  source_currency VARCHAR(10),
  dest_currency VARCHAR(10),
  dest_country TEXT,
  payment_method TEXT,
  reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS routing_overrides_lookup_idx
  ON public.routing_overrides (direction, source_currency, dest_currency) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_overrides TO authenticated;
GRANT ALL ON public.routing_overrides TO service_role;
ALTER TABLE public.routing_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing managers manage routing overrides"
ON public.routing_overrides FOR ALL TO authenticated
USING (public.is_pricing_manager(auth.uid()))
WITH CHECK (public.is_pricing_manager(auth.uid()));

CREATE TRIGGER trg_routing_overrides_updated
BEFORE UPDATE ON public.routing_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.routing_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id UUID REFERENCES public.transfers(id) ON DELETE CASCADE,
  routing_decision_id UUID REFERENCES public.routing_decisions(id) ON DELETE SET NULL,
  partner_id UUID REFERENCES public.payment_partners(id) ON DELETE SET NULL,
  partner_code TEXT,
  function_slug TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  outcome TEXT NOT NULL,
  retryable BOOLEAN NOT NULL DEFAULT false,
  provider_reference TEXT,
  error_message TEXT,
  latency_ms INTEGER,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS routing_attempts_transfer_idx ON public.routing_attempts (transfer_id, attempt_number);
CREATE INDEX IF NOT EXISTS routing_attempts_created_idx ON public.routing_attempts (created_at DESC);

GRANT SELECT ON public.routing_attempts TO authenticated;
GRANT ALL ON public.routing_attempts TO service_role;
ALTER TABLE public.routing_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing managers read routing attempts"
ON public.routing_attempts FOR SELECT TO authenticated
USING (public.is_pricing_manager(auth.uid()));