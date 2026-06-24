-- Board Compliance Dashboard (#3)
-- Aggregated metrics for board oversight: risk indicators, alerts, STRs,
-- investigations, breaches, outages, and reconciliation exceptions.

CREATE TABLE IF NOT EXISTS public.board_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_month date NOT NULL,
  high_risk_clients integer NOT NULL DEFAULT 0,
  open_alerts integer NOT NULL DEFAULT 0,
  pending_strs integer NOT NULL DEFAULT 0,
  outstanding_investigations integer NOT NULL DEFAULT 0,
  compliance_breaches integer NOT NULL DEFAULT 0,
  settlement_failures integer NOT NULL DEFAULT 0,
  payment_failures integer NOT NULL DEFAULT 0,
  system_outages integer NOT NULL DEFAULT 0,
  reconciliation_exceptions integer NOT NULL DEFAULT 0,
  generated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_month)
);

CREATE OR REPLACE VIEW public.board_dashboard_view AS
SELECT
  (SELECT COUNT(*) FROM public.customers WHERE risk_level = 'high' AND is_active = true) AS high_risk_clients,
  (SELECT COUNT(*) FROM public.compliance_alerts WHERE status NOT IN ('resolved', 'false_positive')) AS open_alerts,
  (SELECT COUNT(*) FROM public.compliance_reports WHERE report_type = 'STR' AND status = 'draft') AS pending_strs,
  (SELECT COUNT(*) FROM public.compliance_alerts WHERE status = 'escalated') AS outstanding_investigations,
  (SELECT COUNT(*) FROM public.incidents WHERE category = 'compliance_breach' AND status != 'closed') AS compliance_breaches,
  (SELECT COUNT(*) FROM public.incidents WHERE category = 'safeguarding_failure' AND status != 'closed') AS safeguarding_breaches,
  (SELECT COUNT(*) FROM public.reconciliation_records WHERE status IN ('unmatched', 'exception')) AS reconciliation_exceptions,
  (SELECT COUNT(*) FROM public.incidents WHERE category = 'service_outage' AND status != 'closed') AS system_outages,
  (SELECT COUNT(*) FROM public.incidents WHERE status != 'closed') AS total_incidents,
  (SELECT COUNT(*) FROM public.incidents WHERE is_rpaa_significant = true AND status != 'closed') AS rpaa_significant_incidents,
  now() AS snapshot_at;

ALTER TABLE public.board_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Board reports readable by admin roles" ON public.board_reports;
CREATE POLICY "Board reports readable by admin roles"
  ON public.board_reports FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );

DROP POLICY IF EXISTS "Board reports manageable by admin" ON public.board_reports;
CREATE POLICY "Board reports manageable by admin"
  ON public.board_reports FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Function: snapshot current board metrics
CREATE OR REPLACE FUNCTION public.snapshot_board_metrics(p_month date DEFAULT date_trunc('month', now()))
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report_id uuid;
BEGIN
  INSERT INTO public.board_reports (
    report_month, high_risk_clients, open_alerts, pending_strs,
    outstanding_investigations, compliance_breaches, system_outages,
    reconciliation_exceptions, generated_by
  )
  SELECT
    p_month,
    (SELECT COUNT(*) FROM public.customers WHERE risk_level = 'high' AND is_active = true),
    (SELECT COUNT(*) FROM public.compliance_alerts WHERE status NOT IN ('resolved', 'false_positive')),
    (SELECT COUNT(*) FROM public.compliance_reports WHERE report_type = 'STR' AND status = 'draft'),
    (SELECT COUNT(*) FROM public.compliance_alerts WHERE status = 'escalated'),
    (SELECT COUNT(*) FROM public.incidents WHERE category = 'compliance_breach' AND status != 'closed'),
    (SELECT COUNT(*) FROM public.incidents WHERE category = 'service_outage' AND status != 'closed'),
    (SELECT COUNT(*) FROM public.reconciliation_records WHERE status IN ('unmatched', 'exception')),
    auth.uid()
  ON CONFLICT (report_month) DO UPDATE SET
    high_risk_clients = EXCLUDED.high_risk_clients,
    open_alerts = EXCLUDED.open_alerts,
    pending_strs = EXCLUDED.pending_strs,
    outstanding_investigations = EXCLUDED.outstanding_investigations,
    compliance_breaches = EXCLUDED.compliance_breaches,
    system_outages = EXCLUDED.system_outages,
    reconciliation_exceptions = EXCLUDED.reconciliation_exceptions,
    generated_by = EXCLUDED.generated_by
  RETURNING id INTO v_report_id;

  RETURN v_report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_board_metrics(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snapshot_board_metrics(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_board_metrics(date) TO service_role;