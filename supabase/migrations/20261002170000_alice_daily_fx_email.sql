-- Alice daily FX email: one automated marketing email per day at 08:00 America/Toronto
-- to every client who has not opted out (profiles.email_opt_out, CASL).
--
--   daily_fx_email_settings  single-row kill switch + optional promo line (staff-editable)
--   daily_fx_email_runs      one row per send (daily or test), unique per day for daily
--
-- pg_cron fires at 12:00 and 13:00 UTC so 08:00 Toronto is hit in both EDT and EST;
-- the edge function checks the local hour and the runs table, so only one send happens.

-- ── settings ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_fx_email_settings (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled     boolean NOT NULL DEFAULT true,
  promo_text  text,
  promo_url   text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.daily_fx_email_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ── runs ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_fx_email_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_date        date NOT NULL,
  kind             text NOT NULL DEFAULT 'daily' CHECK (kind IN ('daily', 'test')),
  status           text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  subject          text,
  intro            text,
  tip              text,
  recipient_count  integer NOT NULL DEFAULT 0,
  email_count      integer NOT NULL DEFAULT 0,
  error            text,
  triggered_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_fx_email_runs_daily
  ON public.daily_fx_email_runs (send_date) WHERE kind = 'daily';
CREATE INDEX IF NOT EXISTS idx_daily_fx_email_runs_created
  ON public.daily_fx_email_runs (created_at DESC);

-- ── RLS: staff (admin / finance / compliance) ─────────────────────────────
ALTER TABLE public.daily_fx_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_fx_email_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_fx_settings_staff_read ON public.daily_fx_email_settings;
CREATE POLICY daily_fx_settings_staff_read ON public.daily_fx_email_settings
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'finance', 'compliance')
  ));

DROP POLICY IF EXISTS daily_fx_settings_staff_update ON public.daily_fx_email_settings;
CREATE POLICY daily_fx_settings_staff_update ON public.daily_fx_email_settings
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'finance', 'compliance')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'finance', 'compliance')
  ));

DROP POLICY IF EXISTS daily_fx_runs_staff_read ON public.daily_fx_email_runs;
CREATE POLICY daily_fx_runs_staff_read ON public.daily_fx_email_runs
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'finance', 'compliance')
  ));

GRANT SELECT, UPDATE ON public.daily_fx_email_settings TO authenticated;
GRANT SELECT ON public.daily_fx_email_runs TO authenticated;
GRANT ALL ON public.daily_fx_email_settings TO service_role;
GRANT ALL ON public.daily_fx_email_runs TO service_role;

-- ── scheduler ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_daily_fx_email()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
  v_url text := 'https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/alice-daily-fx';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.daily_fx_email_settings WHERE enabled) THEN
    RETURN;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'edge_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;
  IF v_key IS NULL THEN
    RAISE NOTICE 'Vault secret edge_service_role_key not set; skipping daily FX email';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_key),
    body := jsonb_build_object('mode', 'run'),
    timeout_milliseconds := 300000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'run_daily_fx_email failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.run_daily_fx_email() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_daily_fx_email() TO service_role;

DO $$
DECLARE
  v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'schedule' AND n.nspname IN ('cron', 'extensions')
  LIMIT 1;

  IF v_schema IS NULL THEN
    RAISE NOTICE 'pg_cron not found; schedule run_daily_fx_email() manually';
    RETURN;
  END IF;

  BEGIN
    EXECUTE format('SELECT %I.unschedule(%L)', v_schema, 'alice-daily-fx-email');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  EXECUTE format(
    'SELECT %I.schedule(%L, %L, %L)',
    v_schema, 'alice-daily-fx-email', '0 12,13 * * *', 'SELECT public.run_daily_fx_email();'
  );
END $$;
