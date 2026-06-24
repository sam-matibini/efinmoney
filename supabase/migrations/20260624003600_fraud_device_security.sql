-- Fraud Detection (#20) + Device Analytics (#21) + Security Monitoring (#30)

-- === FRAUD SIGNALS ===
CREATE TABLE IF NOT EXISTS public.fraud_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  signal_type text NOT NULL CHECK (signal_type IN ('account_takeover', 'synthetic_identity', 'mule_account', 'duplicate_identity', 'velocity_abuse', 'device_anomaly', 'geo_anomaly')),
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  score numeric(5,2),
  details jsonb DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fraud_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN ('account_takeover', 'synthetic_identity', 'mule_account', 'duplicate_identity', 'velocity_abuse', 'device_fingerprint', 'geo_jump')),
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.fraud_rules (rule_name, rule_type, parameters) VALUES
  ('Geo Jump', 'geo_jump', '{"max_distance_km": 500, "max_time_minutes": 60}'),
  ('Velocity Spike', 'velocity_abuse', '{"max_transactions": 10, "window_minutes": 60}'),
  ('Device Mismatch', 'device_fingerprint', '{"max_devices_per_day": 3}')
ON CONFLICT DO NOTHING;

ALTER TABLE public.fraud_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fraud signals readable by admin roles" ON public.fraud_signals;
CREATE POLICY "Fraud signals readable by admin roles" ON public.fraud_signals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

DROP POLICY IF EXISTS "Fraud signals manageable by admin compliance" ON public.fraud_signals;
CREATE POLICY "Fraud signals manageable by admin compliance" ON public.fraud_signals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

DROP POLICY IF EXISTS "Fraud rules readable by admin compliance" ON public.fraud_rules;
CREATE POLICY "Fraud rules readable by admin compliance" ON public.fraud_rules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

-- === DEVICE ANALYTICS ===
CREATE TABLE IF NOT EXISTS public.device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  device_fingerprint text,
  ip_address inet,
  country text,
  browser text,
  os text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.device_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Device sessions readable by admin roles" ON public.device_sessions;
CREATE POLICY "Device sessions readable by admin roles" ON public.device_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

DROP POLICY IF EXISTS "Device sessions insertable by any authenticated" ON public.device_sessions;
CREATE POLICY "Device sessions insertable by any authenticated" ON public.device_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Session activity readable by admin roles" ON public.session_activity;
CREATE POLICY "Session activity readable by admin roles" ON public.session_activity FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

-- === SECURITY EVENTS VIEW ===
CREATE OR REPLACE VIEW public.security_events_view AS
SELECT
  'failed_login' as event_type, COUNT(*) as event_count, MAX(created_at) as last_event
FROM public.audit_logs WHERE action = 'LOGIN_FAILED'
UNION ALL
SELECT 'privilege_escalation_attempt', COUNT(*), MAX(created_at)
FROM public.audit_logs WHERE action = 'PRIVILEGE_CHANGE' AND ((old_data->>'role') IS DISTINCT FROM (new_data->>'role'))
UNION ALL
SELECT 'data_export', COUNT(*), MAX(created_at)
FROM public.audit_logs WHERE action = 'DATA_EXPORT'
UNION ALL
SELECT 'suspicious_access', COUNT(*), MAX(created_at)
FROM public.audit_logs WHERE action = 'SUSPICIOUS_ACCESS';

CREATE TABLE IF NOT EXISTS public.security_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Security incidents readable by admin roles" ON public.security_incidents;
CREATE POLICY "Security incidents readable by admin roles" ON public.security_incidents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

DROP POLICY IF EXISTS "Security incidents manageable by admin" ON public.security_incidents;
CREATE POLICY "Security incidents manageable by admin" ON public.security_incidents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));