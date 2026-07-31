-- corridor forecasts
CREATE TABLE public.corridor_forecasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corridor_key TEXT NOT NULL,
  corridor_label TEXT,
  source_currency TEXT,
  dest_currency TEXT,
  dest_country TEXT,
  payment_method TEXT,
  horizon_days INTEGER NOT NULL,
  history_days INTEGER NOT NULL DEFAULT 90,
  history_txn_count INTEGER NOT NULL DEFAULT 0,
  history_volume NUMERIC NOT NULL DEFAULT 0,
  forecast_txn_count NUMERIC NOT NULL DEFAULT 0,
  forecast_volume NUMERIC NOT NULL DEFAULT 0,
  forecast_volume_low NUMERIC NOT NULL DEFAULT 0,
  forecast_volume_high NUMERIC NOT NULL DEFAULT 0,
  forecast_revenue NUMERIC NOT NULL DEFAULT 0,
  forecast_cost NUMERIC NOT NULL DEFAULT 0,
  forecast_gross_profit NUMERIC NOT NULL DEFAULT 0,
  forecast_margin_percent NUMERIC NOT NULL DEFAULT 0,
  trend_percent NUMERIC NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'low',
  method TEXT NOT NULL DEFAULT 'trend_dow_v1',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (corridor_key, horizon_days)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corridor_forecasts TO authenticated;
GRANT ALL ON public.corridor_forecasts TO service_role;
ALTER TABLE public.corridor_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pricing managers manage corridor forecasts" ON public.corridor_forecasts
  FOR ALL TO authenticated USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

-- liquidity forecasts
CREATE TABLE public.liquidity_forecasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL,
  available_balance NUMERIC NOT NULL DEFAULT 0,
  required_reserve NUMERIC NOT NULL DEFAULT 0,
  usable_balance NUMERIC NOT NULL DEFAULT 0,
  forecast_daily_burn NUMERIC NOT NULL DEFAULT 0,
  days_to_dry NUMERIC,
  recommended_topup NUMERIC NOT NULL DEFAULT 0,
  warning_days INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'ok',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, currency_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.liquidity_forecasts TO authenticated;
GRANT ALL ON public.liquidity_forecasts TO service_role;
ALTER TABLE public.liquidity_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pricing managers manage liquidity forecasts" ON public.liquidity_forecasts
  FOR ALL TO authenticated USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

-- funding tasks
CREATE TABLE public.funding_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  due_by TIMESTAMPTZ,
  days_to_dry NUMERIC,
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL DEFAULT 'auto_scan',
  notes TEXT,
  assigned_to UUID,
  completed_by UUID,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX funding_tasks_open_unique
  ON public.funding_tasks (partner_id, currency_code)
  WHERE status IN ('open', 'in_progress');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funding_tasks TO authenticated;
GRANT ALL ON public.funding_tasks TO service_role;
ALTER TABLE public.funding_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pricing managers manage funding tasks" ON public.funding_tasks
  FOR ALL TO authenticated USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

-- partner suspensions
CREATE TABLE public.partner_suspensions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  corridor_key TEXT,
  scope TEXT NOT NULL DEFAULT 'partner',
  reason TEXT NOT NULL,
  trigger_source TEXT NOT NULL DEFAULT 'manual',
  trigger_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  auto_restore BOOLEAN NOT NULL DEFAULT true,
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  suspended_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended_until TIMESTAMPTZ,
  lifted_at TIMESTAMPTZ,
  lifted_by UUID,
  lift_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX partner_suspensions_active_idx ON public.partner_suspensions (partner_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_suspensions TO authenticated;
GRANT ALL ON public.partner_suspensions TO service_role;
ALTER TABLE public.partner_suspensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pricing managers manage partner suspensions" ON public.partner_suspensions
  FOR ALL TO authenticated USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

-- incident settings (singleton)
CREATE TABLE public.incident_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  singleton BOOLEAN NOT NULL DEFAULT true UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  auto_restore BOOLEAN NOT NULL DEFAULT true,
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  lookback_minutes INTEGER NOT NULL DEFAULT 180,
  min_attempts INTEGER NOT NULL DEFAULT 10,
  max_failure_rate_percent NUMERIC NOT NULL DEFAULT 40,
  critical_alert_count INTEGER NOT NULL DEFAULT 3,
  min_score_to_operate NUMERIC NOT NULL DEFAULT 40,
  suspend_scope TEXT NOT NULL DEFAULT 'corridor',
  liquidity_warning_days INTEGER NOT NULL DEFAULT 5,
  forecast_history_days INTEGER NOT NULL DEFAULT 90,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.incident_settings TO authenticated;
GRANT ALL ON public.incident_settings TO service_role;
ALTER TABLE public.incident_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pricing managers manage incident settings" ON public.incident_settings
  FOR ALL TO authenticated USING (public.is_pricing_manager(auth.uid())) WITH CHECK (public.is_pricing_manager(auth.uid()));

INSERT INTO public.incident_settings (singleton) VALUES (true);

CREATE TRIGGER update_corridor_forecasts_updated_at BEFORE UPDATE ON public.corridor_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_liquidity_forecasts_updated_at BEFORE UPDATE ON public.liquidity_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_funding_tasks_updated_at BEFORE UPDATE ON public.funding_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_partner_suspensions_updated_at BEFORE UPDATE ON public.partner_suspensions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_incident_settings_updated_at BEFORE UPDATE ON public.incident_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();