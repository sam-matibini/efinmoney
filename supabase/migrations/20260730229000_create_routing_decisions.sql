-- routing_decisions was hand-run directly in prod without a migration file,
-- blocking all subsequent migrations. This backfills the missing definition.
-- Uses IF NOT EXISTS throughout so it is a safe no-op against prod.

CREATE TABLE IF NOT EXISTS public.routing_decisions (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id          UUID        REFERENCES public.transfers(id) ON DELETE SET NULL,
  routing_rule_id      UUID        REFERENCES public.routing_rules(id) ON DELETE SET NULL,
  selected_partner_id  UUID        REFERENCES public.payment_partners(id) ON DELETE SET NULL,
  actual_partner_id    UUID        REFERENCES public.payment_partners(id) ON DELETE SET NULL,
  source_currency      TEXT        NOT NULL,
  dest_currency        TEXT        NOT NULL,
  source_country       TEXT,
  dest_country         TEXT,
  amount               NUMERIC     NOT NULL,
  direction            public.partner_direction NOT NULL,
  strategy             public.routing_strategy  NOT NULL,
  mode                 TEXT        NOT NULL DEFAULT 'shadow',
  payment_method       TEXT,
  customer_type        TEXT        NOT NULL DEFAULT 'consumer',
  candidates           JSONB       NOT NULL DEFAULT '[]',
  excluded             JSONB       NOT NULL DEFAULT '[]',
  best_expected_profit NUMERIC,
  requested_by         UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS routing_decisions_transfer_idx
  ON public.routing_decisions (transfer_id);

CREATE INDEX IF NOT EXISTS routing_decisions_created_idx
  ON public.routing_decisions (created_at DESC);

ALTER TABLE public.routing_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing managers read routing decisions"
  ON public.routing_decisions FOR SELECT TO authenticated
  USING (public.is_pricing_manager(auth.uid()));

GRANT SELECT ON public.routing_decisions TO authenticated;
GRANT ALL ON public.routing_decisions TO service_role;
