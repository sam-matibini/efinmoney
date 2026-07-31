CREATE TABLE public.partner_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  corridor_key text NOT NULL,
  corridor_label text,
  direction text NOT NULL DEFAULT 'payout',
  source_currency varchar(8),
  dest_currency varchar(8),
  dest_country text,
  payment_method text,
  window_days integer NOT NULL DEFAULT 30,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  success_rate numeric NOT NULL DEFAULT 0,
  avg_settlement_minutes numeric,
  p95_settlement_minutes numeric,
  dispute_count integer NOT NULL DEFAULT 0,
  dispute_rate numeric NOT NULL DEFAULT 0,
  cost_variance_percent numeric NOT NULL DEFAULT 0,
  realised_margin_percent numeric NOT NULL DEFAULT 0,
  modelled_margin_percent numeric NOT NULL DEFAULT 0,
  margin_gap_percent numeric NOT NULL DEFAULT 0,
  liquidity_incidents integer NOT NULL DEFAULT 0,
  score_success numeric NOT NULL DEFAULT 0,
  score_speed numeric NOT NULL DEFAULT 0,
  score_dispute numeric NOT NULL DEFAULT 0,
  score_cost_variance numeric NOT NULL DEFAULT 0,
  score_margin numeric NOT NULL DEFAULT 0,
  score_liquidity numeric NOT NULL DEFAULT 0,
  composite_score numeric NOT NULL DEFAULT 0,
  grade text NOT NULL DEFAULT 'N/A',
  confident boolean NOT NULL DEFAULT false,
  previous_score numeric,
  previous_grade text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, corridor_key)
);

GRANT SELECT ON public.partner_scorecards TO authenticated;
GRANT ALL ON public.partner_scorecards TO service_role;
ALTER TABLE public.partner_scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing managers view scorecards"
ON public.partner_scorecards FOR SELECT TO authenticated
USING (public.is_pricing_manager(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_partner_scorecards_partner ON public.partner_scorecards(partner_id);
CREATE INDEX idx_partner_scorecards_score ON public.partner_scorecards(composite_score);

CREATE TRIGGER trg_partner_scorecards_updated_at
BEFORE UPDATE ON public.partner_scorecards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.partner_score_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  lookback_days integer NOT NULL DEFAULT 30,
  min_attempts integer NOT NULL DEFAULT 20,
  weight_success numeric NOT NULL DEFAULT 35,
  weight_speed numeric NOT NULL DEFAULT 15,
  weight_dispute numeric NOT NULL DEFAULT 15,
  weight_cost_variance numeric NOT NULL DEFAULT 15,
  weight_margin numeric NOT NULL DEFAULT 15,
  weight_liquidity numeric NOT NULL DEFAULT 5,
  min_score_to_route numeric NOT NULL DEFAULT 60,
  below_threshold_action text NOT NULL DEFAULT 'warn',
  max_score_influence numeric NOT NULL DEFAULT 0.15,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_score_weights_action_chk CHECK (below_threshold_action IN ('warn','deprioritise','block')),
  CONSTRAINT partner_score_weights_singleton_chk CHECK (singleton)
);

GRANT SELECT, INSERT, UPDATE ON public.partner_score_weights TO authenticated;
GRANT ALL ON public.partner_score_weights TO service_role;
ALTER TABLE public.partner_score_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing managers view score weights"
ON public.partner_score_weights FOR SELECT TO authenticated
USING (public.is_pricing_manager(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Pricing managers insert score weights"
ON public.partner_score_weights FOR INSERT TO authenticated
WITH CHECK (public.is_pricing_manager(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Pricing managers update score weights"
ON public.partner_score_weights FOR UPDATE TO authenticated
USING (public.is_pricing_manager(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_pricing_manager(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_partner_score_weights_updated_at
BEFORE UPDATE ON public.partner_score_weights
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.partner_score_weights (singleton) VALUES (true) ON CONFLICT DO NOTHING;