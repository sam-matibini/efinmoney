CREATE TABLE IF NOT EXISTS public.partner_observed_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  transfer_id uuid,
  direction text NOT NULL DEFAULT 'payout',
  source_currency text NOT NULL,
  dest_currency text,
  dest_country text,
  payment_method text,
  amount numeric NOT NULL DEFAULT 0,
  observed_fee numeric NOT NULL DEFAULT 0,
  observed_fx_bps numeric,
  contracted_fee numeric,
  contracted_fx_bps numeric,
  drift_percent numeric,
  fee_currency text,
  provider_reference text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_observed_costs TO authenticated;
GRANT ALL ON public.partner_observed_costs TO service_role;

ALTER TABLE public.partner_observed_costs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'partner_observed_costs'
      AND policyname = 'pricing managers manage observed costs'
  ) THEN
    CREATE POLICY "pricing managers manage observed costs"
    ON public.partner_observed_costs FOR ALL TO authenticated
    USING (is_pricing_manager(auth.uid()))
    WITH CHECK (is_pricing_manager(auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_partner_observed_costs_partner ON public.partner_observed_costs (partner_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_observed_costs_corridor ON public.partner_observed_costs (source_currency, dest_currency, payment_method);
CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_observed_costs_ref ON public.partner_observed_costs (partner_id, provider_reference) WHERE provider_reference IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_partner_observed_costs_updated_at') THEN
    CREATE TRIGGER trg_partner_observed_costs_updated_at
    BEFORE UPDATE ON public.partner_observed_costs
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $$;

CREATE OR REPLACE VIEW public.partner_cost_drift AS
SELECT
  o.partner_id,
  p.code AS partner_code,
  p.name AS partner_name,
  o.direction,
  o.source_currency,
  o.dest_currency,
  o.payment_method,
  count(*) AS samples,
  round(avg(o.observed_fee)::numeric, 4) AS avg_observed_fee,
  round(avg(o.contracted_fee)::numeric, 4) AS avg_contracted_fee,
  round(avg(o.observed_fx_bps)::numeric, 2) AS avg_observed_fx_bps,
  round(avg(o.contracted_fx_bps)::numeric, 2) AS avg_contracted_fx_bps,
  round(avg(o.drift_percent)::numeric, 2) AS avg_drift_percent,
  max(o.observed_at) AS last_observed_at
FROM public.partner_observed_costs o
JOIN public.payment_partners p ON p.id = o.partner_id
WHERE o.observed_at > now() - interval '90 days'
GROUP BY 1,2,3,4,5,6,7;

GRANT SELECT ON public.partner_cost_drift TO authenticated;
GRANT SELECT ON public.partner_cost_drift TO service_role;

COMMENT ON TABLE public.partner_observed_costs IS 'What partners actually billed us per transaction, versus their contracted rate card. Feeds cost-variance scoring and pricing drift alerts.';
