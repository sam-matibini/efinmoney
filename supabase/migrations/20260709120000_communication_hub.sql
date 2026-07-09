-- Communication Hub (Phase 1): admin → user broadcasts delivered via the
-- existing in-app notifications rail + optional Resend email.
--
-- Tables:
--   broadcasts            — one row per announcement (draft/scheduled/sent).
--   broadcast_recipients  — audit of who received what, on which channel.
-- profiles.email_opt_out  — CASL consent flag for non-transactional email.

-- ── consent flag ──────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_opt_out boolean NOT NULL DEFAULT false;

-- ── broadcasts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  body             text NOT NULL,
  -- audience: {"scope":"all"}
  --         | {"scope":"segment","kyc_tier":[...],"kyc_status":[...],"country_code":[...]}
  --         | {"scope":"users","user_ids":[...]}
  audience         jsonb NOT NULL DEFAULT '{"scope":"all"}'::jsonb,
  channels         text[] NOT NULL DEFAULT ARRAY['in_app'],
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','scheduled','sending','sent','failed')),
  scheduled_at     timestamptz,
  sent_at          timestamptz,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_count  integer NOT NULL DEFAULT 0,
  in_app_count     integer NOT NULL DEFAULT 0,
  email_count      integer NOT NULL DEFAULT 0,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_status_scheduled
  ON public.broadcasts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_broadcasts_created_at
  ON public.broadcasts (created_at DESC);

-- ── broadcast_recipients (audit) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id  uuid NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  in_app_done   boolean NOT NULL DEFAULT false,
  email_done    boolean NOT NULL DEFAULT false,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broadcast_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast
  ON public.broadcast_recipients (broadcast_id);

-- ── RLS: staff-only (admin / finance / compliance) ────────────────────────
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broadcasts_staff_all ON public.broadcasts;
CREATE POLICY broadcasts_staff_all ON public.broadcasts
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin','finance','compliance')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin','finance','compliance')
  ));

DROP POLICY IF EXISTS broadcast_recipients_staff_read ON public.broadcast_recipients;
CREATE POLICY broadcast_recipients_staff_read ON public.broadcast_recipients
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin','finance','compliance')
  ));

-- Explicit grants (RLS gates rows; grants gate the verb — both are required).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcasts TO authenticated;
GRANT SELECT ON public.broadcast_recipients TO authenticated;

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_broadcasts_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_broadcasts_updated_at ON public.broadcasts;
CREATE TRIGGER trg_broadcasts_updated_at
  BEFORE UPDATE ON public.broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.touch_broadcasts_updated_at();

-- ── scheduled dispatch ────────────────────────────────────────────────────
-- Every 5 minutes, ping the send-broadcast edge function to process any
-- broadcasts whose scheduled_at has passed. Reuses pg_net + a Vault secret
-- so no key is committed to source. In-app "send now" does NOT depend on this;
-- only scheduled sends do.
CREATE OR REPLACE FUNCTION public.dispatch_due_broadcasts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
  v_url text := 'https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/send-broadcast';
  v_has_net boolean;
BEGIN
  -- Nothing due? do nothing.
  IF NOT EXISTS (
    SELECT 1 FROM public.broadcasts
    WHERE status = 'scheduled' AND scheduled_at <= now()
  ) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'http_post' AND n.nspname = 'net'
  ) INTO v_has_net;
  IF NOT v_has_net THEN
    RAISE NOTICE 'pg_net unavailable; scheduled broadcasts need manual dispatch';
    RETURN;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'edge_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;
  IF v_key IS NULL THEN
    RAISE NOTICE 'Vault secret edge_service_role_key not set; skipping scheduled dispatch';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_key),
    body := jsonb_build_object('mode', 'dispatch_due')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_due_broadcasts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_due_broadcasts() TO service_role;

-- Schedule every 5 minutes (dynamic pg_cron schema, skip if not installed).
DO $$
DECLARE
  v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'schedule' AND n.nspname IN ('cron', 'extensions')
  LIMIT 1;

  IF v_schema IS NULL THEN
    RAISE NOTICE 'pg_cron not found; schedule dispatch_due_broadcasts() manually';
    RETURN;
  END IF;

  BEGIN
    EXECUTE format('SELECT %I.unschedule(%L)', v_schema, 'broadcasts-dispatch-due');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  EXECUTE format(
    'SELECT %I.schedule(%L, %L, %L)',
    v_schema, 'broadcasts-dispatch-due', '*/5 * * * *', 'SELECT public.dispatch_due_broadcasts();'
  );
END $$;
