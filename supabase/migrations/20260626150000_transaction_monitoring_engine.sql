-- Batch 1 — AML detection core: automated Transaction Monitoring engine.
-- Evaluates four FINTRAC-relevant rule families against transfers and raises
-- tx_monitoring_alerts. Idempotent (an alert is raised at most once per
-- transaction+rule, or once per customer per rolling window for aggregate rules).
-- Reused on-demand (RPC, role-checked) and nightly (pg_cron) — same shape as the
-- safeguarding automation. Amounts are evaluated in source currency for the
-- detection spine; FX-normalised CAD thresholds arrive with FINTRAC reporting.

CREATE OR REPLACE FUNCTION public.run_transaction_monitoring()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_threshold      numeric := 10000;   -- large single transaction
  v_struct_low     numeric := 9000;    -- structuring band lower bound
  v_velocity_count int     := 5;       -- transfers per rolling 24h
  v_velocity_amt   numeric := 25000;   -- aggregate value per rolling 24h
  v_new   int := 0;
  v_rows  int := 0;
  v_caller uuid := auth.uid();
BEGIN
  -- Authorize: cron context (NULL uid) is allowed; interactive callers must be admin/compliance.
  IF v_caller IS NOT NULL
     AND NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'compliance')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- 1) THRESHOLD — single transfer at/above the reporting threshold.
  INSERT INTO public.tx_monitoring_alerts
    (rule_name, customer_id, transaction_id, alert_type, amount, currency_code, risk_score, status)
  SELECT 'Large transaction ≥ ' || v_threshold, p.id, t.id, 'threshold',
         t.source_amount, t.source_currency, 70, 'open'
  FROM public.transfers t
  JOIN public.profiles p ON p.user_id = t.sender_id
  WHERE t.source_amount >= v_threshold
    AND NOT EXISTS (
      SELECT 1 FROM public.tx_monitoring_alerts a
      WHERE a.transaction_id = t.id AND a.alert_type = 'threshold');
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_new := v_new + v_rows;

  -- 2) STRUCTURING — 3+ transfers just below threshold by one sender within 7 days.
  INSERT INTO public.tx_monitoring_alerts
    (rule_name, customer_id, transaction_id, alert_type, amount, currency_code, risk_score, status)
  SELECT 'Possible structuring: ' || s.cnt || ' transfers just under threshold (7d)',
         p.id, NULL, 'structuring', s.total, 'CAD', 80, 'open'
  FROM (
    SELECT t.sender_id, count(*) AS cnt, sum(t.source_amount) AS total
    FROM public.transfers t
    WHERE t.created_at >= now() - interval '7 days'
      AND t.source_amount >= v_struct_low
      AND t.source_amount <  v_threshold
    GROUP BY t.sender_id
    HAVING count(*) >= 3
  ) s
  JOIN public.profiles p ON p.user_id = s.sender_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tx_monitoring_alerts a
    WHERE a.customer_id = p.id AND a.alert_type = 'structuring'
      AND a.created_at >= now() - interval '7 days');
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_new := v_new + v_rows;

  -- 3) VELOCITY — burst of transfers (count or value) by one sender within 24h.
  INSERT INTO public.tx_monitoring_alerts
    (rule_name, customer_id, transaction_id, alert_type, amount, currency_code, risk_score, status)
  SELECT 'Velocity: ' || v.cnt || ' transfers / ' || v.total || ' in 24h',
         p.id, NULL, 'velocity', v.total, 'CAD', 60, 'open'
  FROM (
    SELECT t.sender_id, count(*) AS cnt, sum(t.source_amount) AS total
    FROM public.transfers t
    WHERE t.created_at >= now() - interval '24 hours'
    GROUP BY t.sender_id
    HAVING count(*) >= v_velocity_count OR sum(t.source_amount) >= v_velocity_amt
  ) v
  JOIN public.profiles p ON p.user_id = v.sender_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tx_monitoring_alerts a
    WHERE a.customer_id = p.id AND a.alert_type = 'velocity'
      AND a.created_at >= now() - interval '24 hours');
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_new := v_new + v_rows;

  -- 4) GEOGRAPHY — transfer destined for a high-risk / prohibited jurisdiction.
  INSERT INTO public.tx_monitoring_alerts
    (rule_name, customer_id, transaction_id, alert_type, amount, currency_code, risk_score, status)
  SELECT 'High-risk geography: ' || g.country_name || ' (' || g.risk_level || ')',
         p.id, t.id, 'geography', t.source_amount, t.source_currency,
         CASE WHEN g.risk_level = 'prohibited' THEN 90 ELSE 65 END, 'open'
  FROM public.transfers t
  JOIN public.geographic_risk_ratings g ON g.country_code = t.recipient_country
  JOIN public.profiles p ON p.user_id = t.sender_id
  WHERE g.risk_level IN ('high', 'prohibited')
    AND NOT EXISTS (
      SELECT 1 FROM public.tx_monitoring_alerts a
      WHERE a.transaction_id = t.id AND a.alert_type = 'geography');
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_new := v_new + v_rows;

  -- Notify compliance role-holders of newly raised alerts (idempotent per run window).
  IF v_new > 0 THEN
    INSERT INTO public.admin_notifications (admin_id, type, payload)
    SELECT DISTINCT ur.user_id, 'tx_monitoring_alert',
           jsonb_build_object('new_alerts', v_new,
                              'message', v_new || ' new transaction-monitoring alert(s) require review.')
    FROM public.user_roles ur
    WHERE ur.role IN ('admin', 'compliance');
  END IF;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.run_transaction_monitoring() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_transaction_monitoring() TO authenticated, service_role;

-- Schedule nightly at 02:00 UTC. Resolve pg_cron's schema dynamically; skip if absent.
DO $$
DECLARE v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'schedule' AND n.nspname IN ('cron', 'extensions')
  LIMIT 1;

  IF v_schema IS NULL THEN
    RAISE NOTICE 'pg_cron not found; run public.run_transaction_monitoring() on your own schedule';
    RETURN;
  END IF;

  BEGIN EXECUTE format('SELECT %I.unschedule(%L)', v_schema, 'tx-monitoring-nightly');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  EXECUTE format('SELECT %I.schedule(%L, %L, %L)',
    v_schema, 'tx-monitoring-nightly', '0 2 * * *',
    'SELECT public.run_transaction_monitoring();');
END $$;
