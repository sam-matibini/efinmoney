-- Unclaimed Funds (Module 17): escalate_unclaimed_funds() only ever moved status
-- forward when days_outstanding crossed a threshold, but nothing aged
-- days_outstanding itself (it defaulted to 0 at insert and was never updated),
-- so escalation never actually fired. Recompute it from created_at each run,
-- then schedule the sweep daily via pg_cron (same pattern as safeguarding-daily).

CREATE OR REPLACE FUNCTION public.escalate_unclaimed_funds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.unclaimed_funds
  SET days_outstanding = GREATEST(0, floor(extract(epoch FROM (now() - created_at)) / 86400))::integer
  WHERE status NOT IN ('resolved', 'written_off');

  UPDATE public.unclaimed_funds SET status = 'escalated_1d' WHERE status = 'identified' AND days_outstanding >= 1;
  UPDATE public.unclaimed_funds SET status = 'escalated_3d' WHERE status IN ('identified', 'escalated_1d') AND days_outstanding >= 3;
  UPDATE public.unclaimed_funds SET status = 'escalated_7d' WHERE status IN ('identified', 'escalated_1d', 'escalated_3d') AND days_outstanding >= 7;
  UPDATE public.unclaimed_funds SET status = 'escalated_30d' WHERE status IN ('identified', 'escalated_1d', 'escalated_3d', 'escalated_7d') AND days_outstanding >= 30;
END;
$$;

REVOKE ALL ON FUNCTION public.escalate_unclaimed_funds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.escalate_unclaimed_funds() TO service_role;

-- Schedule daily at 05:00 UTC. Resolve pg_cron's schema dynamically, skip
-- gracefully if pg_cron isn't installed, idempotent across re-runs.
DO $$
DECLARE
  v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'schedule'
    AND n.nspname IN ('cron', 'extensions')
  LIMIT 1;

  IF v_schema IS NULL THEN
    RAISE NOTICE 'pg_cron schedule() not found; skipping cron scheduling (run escalate_unclaimed_funds() manually)';
    RETURN;
  END IF;

  BEGIN
    EXECUTE format('SELECT %I.unschedule(%L)', v_schema, 'unclaimed-funds-escalation-daily');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- job didn't exist yet
  END;

  EXECUTE format(
    'SELECT %I.schedule(%L, %L, %L)',
    v_schema, 'unclaimed-funds-escalation-daily', '0 5 * * *', 'SELECT public.escalate_unclaimed_funds();'
  );
END $$;
