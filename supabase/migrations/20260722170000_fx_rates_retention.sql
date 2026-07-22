-- fx_rates retention and lookup cost.
--
-- refresh-fx-rates INSERTs ~306 rows per run and never prunes. It was dormant
-- from 2026-06-13 until today, so the 417K rows already there were static --
-- but scheduling it hourly (20260722160000) restarted accumulation at roughly
-- 7,300 rows/day, ~2.7M/year.
--
-- Two problems, both addressed here:
--
--   1. GROWTH. Expired rows are dead weight: every consumer reads either the
--      currently-valid set or the latest row per pair. Checked before writing
--      this -- useFxRates, lib/fx.ts, appSession, PricingSettingsPanel,
--      flutterwave.ts, execute-crypto-swap and the FINTRAC EFTR sweep all take
--      `ORDER BY valid_from DESC LIMIT 1` or filter on valid_until. Nothing
--      does a point-in-time historical lookup, so old rows can go.
--
--      EXCEPT rows with valid_until IS NULL. fx-engine queries specifically for
--      those (`.is('valid_until', null)`) -- they are the hand-seeded permanent
--      rates, and pruning them would break it. They are excluded throughout.
--
--   2. LOOKUP COST. fx_convert wraps both currency columns in upper(), which
--      makes the existing btree on (from_currency, to_currency, valid_from)
--      unusable -- so it full-scans. That now happens twice per transfer, once
--      for screening and once for limits. A matching functional index fixes it.

-- ============== index matching fx_convert's access pattern ==============
CREATE INDEX IF NOT EXISTS idx_fx_rates_upper_pair_validfrom
  ON public.fx_rates (upper(from_currency), upper(to_currency), valid_from DESC);

-- Supports the "is anything still valid" filter without scanning expired rows.
CREATE INDEX IF NOT EXISTS idx_fx_rates_valid_until
  ON public.fx_rates (valid_until)
  WHERE valid_until IS NOT NULL;

-- ============== retention ==============
-- Deletes expired rows older than the retention window. Never touches rows with
-- valid_until IS NULL (fx-engine's permanent rates). Returns rows deleted.
--
-- Default 7 days keeps a week of rate history for auditing a disputed quote
-- while bounding the table at roughly 50K rows at the current hourly cadence.
CREATE OR REPLACE FUNCTION public.prune_fx_rates(p_retention interval DEFAULT '7 days')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.fx_rates
   WHERE valid_until IS NOT NULL
     AND valid_until < now() - p_retention;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.prune_fx_rates(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_fx_rates(interval) TO service_role;

-- ============== prune alongside each refresh ==============
-- Folded into run_fx_refresh rather than given its own cron: it is cheap once
-- the backlog is gone, and one job is one thing to notice when it breaks.
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
  v_pruned integer;
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

  -- Prune in the same run. Deliberately AFTER the post: net.http_post only
  -- queues the request, so this never delays the refresh itself.
  v_pruned := public.prune_fx_rates();
  IF v_pruned > 0 THEN
    RAISE NOTICE 'prune_fx_rates removed % expired row(s)', v_pruned;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'run_fx_refresh failed: %', SQLERRM;
END;
$function$;

REVOKE ALL ON FUNCTION public.run_fx_refresh() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_fx_refresh() TO service_role;

-- NOTE: the existing ~417K-row backlog is NOT deleted by this migration.
-- A single DELETE that large takes a lock and is not something a migration
-- should do to a live database unattended. Clear it deliberately, in batches:
--
--   SELECT public.prune_fx_rates('7 days');   -- repeat until it returns 0
--
-- then reclaim the space:
--
--   VACUUM ANALYZE public.fx_rates;
