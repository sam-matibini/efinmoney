-- transaction_economics was hand-run directly in prod without a migration file,
-- blocking all subsequent migrations. This backfills the missing definition.
-- Uses IF NOT EXISTS throughout so it is a safe no-op against prod.

CREATE TABLE IF NOT EXISTS public.transaction_economics (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id          uuid        REFERENCES public.transfers(id) ON DELETE SET NULL,
  routing_decision_id  uuid        REFERENCES public.routing_decisions(id) ON DELETE SET NULL,
  partner_id           uuid        REFERENCES public.payment_partners(id) ON DELETE SET NULL,
  source_currency      text,
  dest_currency        text,
  dest_country         text,
  direction            public.partner_direction,
  amount               numeric     NOT NULL DEFAULT 0,
  currency_code        text,
  customer_type        text,
  payment_method       text,
  customer_fee_revenue numeric     DEFAULT 0,
  customer_fx_revenue  numeric     DEFAULT 0,
  partner_fee_cost     numeric     DEFAULT 0,
  partner_fx_cost      numeric     DEFAULT 0,
  network_cost         numeric     DEFAULT 0,
  compliance_cost      numeric     DEFAULT 0,
  infrastructure_cost  numeric     DEFAULT 0,
  settlement_cost      numeric     DEFAULT 0,
  total_revenue        numeric     DEFAULT 0,
  total_cost           numeric     DEFAULT 0,
  gross_profit         numeric     DEFAULT 0,
  margin_percent       numeric     DEFAULT 0,
  settled_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.transaction_economics TO authenticated;
GRANT ALL    ON public.transaction_economics TO service_role;

ALTER TABLE public.transaction_economics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Pricing managers read transaction economics" ON public.transaction_economics;
CREATE POLICY "Pricing managers read transaction economics"
  ON public.transaction_economics FOR SELECT TO authenticated
  USING (public.is_pricing_manager(auth.uid()));

CREATE INDEX IF NOT EXISTS transaction_economics_transfer_idx
  ON public.transaction_economics (transfer_id);
CREATE INDEX IF NOT EXISTS transaction_economics_partner_idx
  ON public.transaction_economics (partner_id, created_at DESC);
