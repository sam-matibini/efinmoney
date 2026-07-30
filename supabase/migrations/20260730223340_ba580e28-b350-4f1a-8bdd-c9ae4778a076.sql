
-- ============ ENUMS ============
DO $$ BEGIN CREATE TYPE public.partner_direction AS ENUM ('payin','payout','both'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.partner_op_status AS ENUM ('active','inactive','suspended','pending'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.partner_fee_type AS ENUM ('fixed','percentage','hybrid','tiered'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pricing_source AS ENUM ('api','file','manual','partner_portal'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.risk_rating AS ENUM ('low','medium','high'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.routing_strategy AS ENUM ('lowest_cost','highest_profit','highest_expected_profit','best_overall'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ helper: admin or finance ============
CREATE OR REPLACE FUNCTION public.is_pricing_manager(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role IN ('admin','finance'))
    OR EXISTS (SELECT 1 FROM public.admin_users WHERE id = _uid)
  );
$$;

-- ============ payment_partners ============
CREATE TABLE IF NOT EXISTS public.payment_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  direction public.partner_direction NOT NULL DEFAULT 'both',
  country text,
  regulatory_status text,
  api_status public.partner_op_status NOT NULL DEFAULT 'pending',
  integration_status public.partner_op_status NOT NULL DEFAULT 'pending',
  settlement_currency varchar(10),
  supported_currencies text[] NOT NULL DEFAULT '{}',
  supported_countries text[] NOT NULL DEFAULT '{}',
  payment_methods text[] NOT NULL DEFAULT '{}',
  payin_function_slug text,
  payout_function_slug text,
  quote_function_slug text,
  min_transaction numeric,
  max_transaction numeric,
  daily_limit numeric,
  monthly_limit numeric,
  settlement_time text,
  reliability_score numeric NOT NULL DEFAULT 100 CHECK (reliability_score BETWEEN 0 AND 100),
  compliance_risk public.risk_rating NOT NULL DEFAULT 'low',
  priority integer NOT NULL DEFAULT 100,
  effective_date date,
  expiry_date date,
  status public.partner_op_status NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_partners TO authenticated;
GRANT ALL ON public.payment_partners TO service_role;
ALTER TABLE public.payment_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing managers manage partners" ON public.payment_partners FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

-- ============ partner_corridors ============
CREATE TABLE IF NOT EXISTS public.partner_corridors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  direction public.partner_direction NOT NULL,
  source_country text,
  dest_country text NOT NULL,
  source_currency varchar(10) NOT NULL,
  dest_currency varchar(10) NOT NULL,
  payment_method text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  est_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_corridors_lookup_idx
  ON public.partner_corridors(direction, source_currency, dest_currency, dest_country, payment_method) WHERE enabled;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_corridors TO authenticated;
GRANT ALL ON public.partner_corridors TO service_role;
ALTER TABLE public.partner_corridors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing managers manage corridors" ON public.partner_corridors FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

-- ============ partner_limits ============
CREATE TABLE IF NOT EXISTS public.partner_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  corridor_id uuid REFERENCES public.partner_corridors(id) ON DELETE CASCADE,
  currency_code varchar(10) NOT NULL,
  min_amount numeric,
  max_amount numeric,
  daily_limit numeric,
  monthly_limit numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_limits TO authenticated;
GRANT ALL ON public.partner_limits TO service_role;
ALTER TABLE public.partner_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing managers manage partner limits" ON public.partner_limits FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

-- ============ partner_pricing (append-only, versioned) ============
CREATE TABLE IF NOT EXISTS public.partner_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  direction public.partner_direction NOT NULL,
  source_country text,
  dest_country text,
  source_currency varchar(10) NOT NULL,
  dest_currency varchar(10) NOT NULL,
  payment_method text NOT NULL,
  fee_type public.partner_fee_type NOT NULL DEFAULT 'hybrid',
  fixed_fee numeric NOT NULL DEFAULT 0,
  percentage_fee numeric NOT NULL DEFAULT 0,
  min_fee numeric,
  max_fee numeric,
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  fx_markup_bps numeric NOT NULL DEFAULT 0,
  settlement_fee numeric NOT NULL DEFAULT 0,
  network_fee numeric NOT NULL DEFAULT 0,
  compliance_fee numeric NOT NULL DEFAULT 0,
  fee_currency varchar(10),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  source public.pricing_source NOT NULL DEFAULT 'manual',
  source_reference text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_pricing_lookup_idx
  ON public.partner_pricing(partner_id, direction, source_currency, dest_currency, payment_method, effective_from DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_pricing TO authenticated;
GRANT ALL ON public.partner_pricing TO service_role;
ALTER TABLE public.partner_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing managers manage partner pricing" ON public.partner_pricing FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

-- supersede previous version instead of overwriting
CREATE OR REPLACE FUNCTION public.supersede_partner_pricing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.partner_pricing
     SET effective_to = NEW.effective_from
   WHERE partner_id = NEW.partner_id
     AND direction = NEW.direction
     AND source_currency = NEW.source_currency
     AND dest_currency = NEW.dest_currency
     AND payment_method = NEW.payment_method
     AND COALESCE(dest_country,'') = COALESCE(NEW.dest_country,'')
     AND id <> NEW.id
     AND effective_to IS NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_supersede_partner_pricing ON public.partner_pricing;
CREATE TRIGGER trg_supersede_partner_pricing AFTER INSERT ON public.partner_pricing
  FOR EACH ROW EXECUTE FUNCTION public.supersede_partner_pricing();

-- ============ partner_fx_rates ============
CREATE TABLE IF NOT EXISTS public.partner_fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  base_currency varchar(10) NOT NULL,
  quote_currency varchar(10) NOT NULL,
  partner_rate numeric NOT NULL CHECK (partner_rate > 0),
  mid_market_rate numeric,
  fx_spread_bps numeric,
  rate_timestamp timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  source public.pricing_source NOT NULL DEFAULT 'manual',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_fx_rates_lookup_idx
  ON public.partner_fx_rates(partner_id, base_currency, quote_currency, rate_timestamp DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_fx_rates TO authenticated;
GRANT ALL ON public.partner_fx_rates TO service_role;
ALTER TABLE public.partner_fx_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing managers manage partner fx" ON public.partner_fx_rates FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_partner_fx_spread()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.mid_market_rate IS NOT NULL AND NEW.mid_market_rate > 0 THEN
    NEW.fx_spread_bps := ROUND(((NEW.mid_market_rate - NEW.partner_rate) / NEW.mid_market_rate) * 10000, 2);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_partner_fx_spread ON public.partner_fx_rates;
CREATE TRIGGER trg_partner_fx_spread BEFORE INSERT OR UPDATE ON public.partner_fx_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_partner_fx_spread();

-- ============ efinmoney_pricing ============
CREATE TABLE IF NOT EXISTS public.efinmoney_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_type text NOT NULL DEFAULT 'consumer',
  direction public.partner_direction NOT NULL,
  source_country text,
  dest_country text,
  source_currency varchar(10) NOT NULL,
  dest_currency varchar(10) NOT NULL,
  payment_method text,
  fixed_fee numeric NOT NULL DEFAULT 0,
  percentage_fee numeric NOT NULL DEFAULT 0,
  fx_margin_bps numeric NOT NULL DEFAULT 0,
  min_fee numeric,
  max_fee numeric,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS efinmoney_pricing_lookup_idx
  ON public.efinmoney_pricing(direction, source_currency, dest_currency, customer_type, effective_from DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.efinmoney_pricing TO authenticated;
GRANT ALL ON public.efinmoney_pricing TO service_role;
ALTER TABLE public.efinmoney_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing managers manage efinmoney pricing" ON public.efinmoney_pricing FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

-- ============ routing_rules ============
CREATE TABLE IF NOT EXISTS public.routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  strategy public.routing_strategy NOT NULL DEFAULT 'best_overall',
  weight_profit numeric NOT NULL DEFAULT 50,
  weight_success numeric NOT NULL DEFAULT 20,
  weight_fx numeric NOT NULL DEFAULT 10,
  weight_speed numeric NOT NULL DEFAULT 10,
  weight_risk numeric NOT NULL DEFAULT 10,
  min_success_rate numeric NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 2,
  failure_cost_percent numeric NOT NULL DEFAULT 0,
  chargeback_cost_percent numeric NOT NULL DEFAULT 0,
  fraud_cost_percent numeric NOT NULL DEFAULT 0,
  compliance_cost_fixed numeric NOT NULL DEFAULT 0,
  infrastructure_cost_fixed numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routing_rules TO authenticated;
GRANT ALL ON public.routing_rules TO service_role;
ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing managers manage routing rules" ON public.routing_rules FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_single_active_routing_rule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active THEN
    UPDATE public.routing_rules SET is_active = false WHERE id <> NEW.id AND is_active;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_single_active_routing_rule ON public.routing_rules;
CREATE TRIGGER trg_single_active_routing_rule AFTER INSERT OR UPDATE OF is_active ON public.routing_rules
  FOR EACH ROW WHEN (NEW.is_active) EXECUTE FUNCTION public.enforce_single_active_routing_rule();

-- ============ partner_liquidity ============
CREATE TABLE IF NOT EXISTS public.partner_liquidity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  currency_code varchar(10) NOT NULL,
  available_balance numeric NOT NULL DEFAULT 0,
  required_reserve numeric NOT NULL DEFAULT 0,
  daily_utilized numeric NOT NULL DEFAULT 0,
  as_of timestamptz NOT NULL DEFAULT now(),
  source public.pricing_source NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, currency_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_liquidity TO authenticated;
GRANT ALL ON public.partner_liquidity TO service_role;
ALTER TABLE public.partner_liquidity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing managers manage partner liquidity" ON public.partner_liquidity FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

-- ============ partner_performance ============
CREATE TABLE IF NOT EXISTS public.partner_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  corridor_key text NOT NULL DEFAULT 'ALL',
  window_days integer NOT NULL DEFAULT 30,
  total_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  reversal_count integer NOT NULL DEFAULT 0,
  success_rate numeric NOT NULL DEFAULT 100,
  avg_processing_seconds numeric,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, corridor_key, window_days)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_performance TO authenticated;
GRANT ALL ON public.partner_performance TO service_role;
ALTER TABLE public.partner_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing managers read partner performance" ON public.partner_performance FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

-- ============ updated_at triggers ============
DROP TRIGGER IF EXISTS trg_pp_updated ON public.payment_partners;
CREATE TRIGGER trg_pp_updated BEFORE UPDATE ON public.payment_partners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_pc_updated ON public.partner_corridors;
CREATE TRIGGER trg_pc_updated BEFORE UPDATE ON public.partner_corridors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_pl_updated ON public.partner_limits;
CREATE TRIGGER trg_pl_updated BEFORE UPDATE ON public.partner_limits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_rr_updated ON public.routing_rules;
CREATE TRIGGER trg_rr_updated BEFORE UPDATE ON public.routing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_pliq_updated ON public.partner_liquidity;
CREATE TRIGGER trg_pliq_updated BEFORE UPDATE ON public.partner_liquidity FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ seed default routing strategy ============
INSERT INTO public.routing_rules (name, strategy, is_active)
SELECT 'Best Overall (default)', 'best_overall', true
WHERE NOT EXISTS (SELECT 1 FROM public.routing_rules);

NOTIFY pgrst, 'reload schema';
