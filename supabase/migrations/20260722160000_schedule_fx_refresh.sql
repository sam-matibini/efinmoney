-- Schedule refresh-fx-rates.
--
-- The function writes rows with valid_until = now + 2 hours and nothing has
-- ever scheduled it -- no pg_cron job, no Vercel cron, no CI schedule. Rates
-- were last refreshed 2026-06-13 and sat 39 days stale until today, which left
-- fx_convert returning NULL for every non-CAD pair and limit enforcement
-- failing open on the entire NGN corridor.
--
-- Hourly, so a single missed run still leaves an hour of validity in hand.

CREATE OR REPLACE FUNCTION public.run_fx_refresh()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url text := public.edge_function_url('refresh-fx-rates');
  v_key text := current_setting('app.settings.anon_key', true);
  v_headers jsonb := jsonb_build_object('Content-Type', 'application/json');
BEGIN
  -- refresh-fx-rates runs with verify_jwt = false, so no key is required. If
  -- the project is ever locked down, set app.settings.anon_key and the header
  -- is added automatically.
  IF v_key IS NOT NULL AND v_key <> '' THEN
    v_headers := v_headers || jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'apikey', v_key
    );
  END IF;

  PERFORM net.http_post(url := v_url, headers := v_headers, body := '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'run_fx_refresh failed: %', SQLERRM;
END;
$function$;

REVOKE ALL ON FUNCTION public.run_fx_refresh() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_fx_refresh() TO service_role;

-- Schedule hourly. pg_cron's functions may live in the `cron` or `extensions`
-- schema depending on how the extension was installed, so resolve the schema
-- dynamically. Idempotent: drop any prior job of the same name first. If
-- pg_cron isn't found, skip without failing the migration.
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
    RAISE NOTICE 'pg_cron schedule() not found; skipping cron scheduling. Schedule refresh-fx-rates externally, or FX rates will go stale again within 2 hours.';
    RETURN;
  END IF;

  BEGIN
    EXECUTE format('SELECT %I.unschedule(%L)', v_schema, 'fx-refresh-hourly');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- job didn't exist yet
  END;

  EXECUTE format(
    'SELECT %I.schedule(%L, %L, %L)',
    v_schema, 'fx-refresh-hourly', '5 * * * *', 'SELECT public.run_fx_refresh();'
  );

  RAISE NOTICE 'Scheduled fx-refresh-hourly at 5 minutes past each hour.';
END $$;
