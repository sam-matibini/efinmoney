CREATE TABLE public.partner_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  message text NOT NULL,
  partner_id uuid REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  corridor_key text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  occurrences integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_alerts TO authenticated;
GRANT ALL ON public.partner_alerts TO service_role;

ALTER TABLE public.partner_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing managers manage partner alerts"
ON public.partner_alerts FOR ALL TO authenticated
USING (public.is_pricing_manager(auth.uid()) OR public.is_admin_user(auth.uid()))
WITH CHECK (public.is_pricing_manager(auth.uid()) OR public.is_admin_user(auth.uid()));

CREATE INDEX idx_partner_alerts_status ON public.partner_alerts (status, last_seen_at DESC);
CREATE INDEX idx_partner_alerts_partner ON public.partner_alerts (partner_id);

CREATE TRIGGER update_partner_alerts_updated_at
BEFORE UPDATE ON public.partner_alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();