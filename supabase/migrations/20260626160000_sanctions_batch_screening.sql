-- Batch 2 — Sanctions screening engine: batch/all-customer screening + daily rescreen.
-- The per-subject run_sanctions_screening() and the watchlist already exist; this
-- adds (a) a unique key so list ingestion can upsert, and (b) an all-customer
-- screening sweep callable on demand (role-checked) and nightly via pg_cron.

-- Enable upsert-by-source for the sanctions-sync edge function.
CREATE UNIQUE INDEX IF NOT EXISTS aml_watchlist_source_sourceid
  ON public.aml_watchlist (source, source_id);

CREATE OR REPLACE FUNCTION public.run_sanctions_screening_all()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_screened int  := 0;
  v_hits     int  := 0;
  v_sid      uuid;
  r          record;
BEGIN
  IF v_caller IS NOT NULL
     AND NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'compliance')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Screen every customer with a name not already rescreened in the last 24h.
  FOR r IN
    SELECT p.user_id, p.full_name, p.country_code
    FROM public.profiles p
    WHERE p.full_name IS NOT NULL
      AND length(trim(p.full_name)) > 1
      AND NOT EXISTS (
        SELECT 1 FROM public.aml_screenings s
        WHERE s.user_id = p.user_id
          AND s.trigger = 'rescreen'
          AND s.screened_at >= now() - interval '24 hours')
  LOOP
    v_sid := public.run_sanctions_screening(r.user_id, r.full_name, NULL, r.country_code, 'rescreen');
    v_screened := v_screened + 1;
    IF EXISTS (SELECT 1 FROM public.aml_screenings s WHERE s.id = v_sid AND s.status = 'hit') THEN
      v_hits := v_hits + 1;
    END IF;
  END LOOP;

  -- Escalate to compliance if any potential matches surfaced this run.
  IF v_hits > 0 THEN
    INSERT INTO public.admin_notifications (admin_id, type, payload)
    SELECT DISTINCT ur.user_id, 'sanctions_hit',
           jsonb_build_object('hits', v_hits, 'screened', v_screened,
             'message', v_hits || ' sanctions match(es) need review from the latest screening sweep.')
    FROM public.user_roles ur
    WHERE ur.role IN ('admin', 'compliance');
  END IF;

  RETURN v_screened;
END;
$$;

REVOKE ALL ON FUNCTION public.run_sanctions_screening_all() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_sanctions_screening_all() TO authenticated, service_role;

-- Nightly rescreen at 03:00 UTC. Resolve pg_cron schema dynamically; skip if absent.
DO $$
DECLARE v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'schedule' AND n.nspname IN ('cron', 'extensions')
  LIMIT 1;

  IF v_schema IS NULL THEN
    RAISE NOTICE 'pg_cron not found; run public.run_sanctions_screening_all() on your own schedule';
    RETURN;
  END IF;

  BEGIN EXECUTE format('SELECT %I.unschedule(%L)', v_schema, 'sanctions-rescreen-nightly');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  EXECUTE format('SELECT %I.schedule(%L, %L, %L)',
    v_schema, 'sanctions-rescreen-nightly', '0 3 * * *',
    'SELECT public.run_sanctions_screening_all();');
END $$;
