-- Schedule Fincra + Flutterwave transfer reconcile every 5 minutes via pg_cron + pg_net.
-- Uses vault secret edge_service_role_key as x-internal-secret (same pattern as broadcasts).
-- Skips gracefully when pg_cron / pg_net / vault secret are missing.

CREATE OR REPLACE FUNCTION public.run_fincra_transfer_reconcile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
  v_url text := 'https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/fincra-reconcile-transfers';
  v_has_net boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'http_post' AND n.nspname = 'net'
  ) INTO v_has_net;
  IF NOT v_has_net THEN
    RAISE NOTICE 'pg_net unavailable; run fincra-reconcile-transfers manually';
    RETURN;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'edge_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;
  IF v_key IS NULL THEN
    RAISE NOTICE 'Vault secret edge_service_role_key not set; skipping fincra reconcile';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_flw_transfer_reconcile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
  v_url text := 'https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/flw-reconcile-transfers';
  v_has_net boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'http_post' AND n.nspname = 'net'
  ) INTO v_has_net;
  IF NOT v_has_net THEN
    RAISE NOTICE 'pg_net unavailable; run flw-reconcile-transfers manually';
    RETURN;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'edge_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;
  IF v_key IS NULL THEN
    RAISE NOTICE 'Vault secret edge_service_role_key not set; skipping flw reconcile';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_fincra_transfer_reconcile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_fincra_transfer_reconcile() TO service_role;

REVOKE ALL ON FUNCTION public.run_flw_transfer_reconcile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_flw_transfer_reconcile() TO service_role;

DO $$
DECLARE
  v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'schedule' AND n.nspname IN ('cron', 'extensions')
  LIMIT 1;

  IF v_schema IS NULL THEN
    RAISE NOTICE 'pg_cron not found; schedule run_fincra_transfer_reconcile / run_flw_transfer_reconcile manually';
    RETURN;
  END IF;

  BEGIN
    EXECUTE format('SELECT %I.unschedule(%L)', v_schema, 'fincra-transfer-reconcile-5m');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    EXECUTE format('SELECT %I.unschedule(%L)', v_schema, 'flw-transfer-reconcile-5m');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  EXECUTE format(
    'SELECT %I.schedule(%L, %L, %L)',
    v_schema,
    'fincra-transfer-reconcile-5m',
    '*/5 * * * *',
    'SELECT public.run_fincra_transfer_reconcile();'
  );

  EXECUTE format(
    'SELECT %I.schedule(%L, %L, %L)',
    v_schema,
    'flw-transfer-reconcile-5m',
    '*/5 * * * *',
    'SELECT public.run_flw_transfer_reconcile();'
  );
END $$;
