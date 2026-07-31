-- Board Compliance Dashboard: align the "high-risk clients" metric with
-- end users instead of the AR/CRM customers table.
--
-- 1. profiles is missing a categorical risk_level column. Add it mirroring
--    the pattern already on public.customers and public.business_profiles.
-- 2. Redefine board_dashboard_view to count from public.profiles.
-- 3. Update snapshot_board_metrics() to use the same source so future
--    monthly snapshots stay consistent with the live view.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS risk_level varchar(50) NOT NULL DEFAULT 'medium'
  CHECK (risk_level IN ('low', 'medium', 'high'));

CREATE OR REPLACE VIEW public.board_dashboard_view AS
SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE risk_level = 'high') AS high_risk_clients,
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
    (SELECT COUNT(*) FROM public.profiles WHERE risk_level = 'high'),
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
