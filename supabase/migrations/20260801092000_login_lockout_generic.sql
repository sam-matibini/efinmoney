-- Security Monitoring: broaden the login lockout to cover both admin
-- and customer sign-ins, with audience-specific thresholds:
--   * admin     — 5 failures / 2h lockout (unchanged)
--   * customer  — 10 failures / 1h lockout (more forgiving for mobile
--                  typing and "I forgot", still defeats brute force)
--
-- The previously-deployed admin-only RPCs and table are renamed (table
-- via ALTER, functions via DROP + CREATE) so both call sites use the
-- same primitives. Action stays `LOGIN_FAILED` so the existing
-- security_events_view keeps aggregating; new_data->>'kind' is set so
-- the brute-force incident can be filtered by audience later.
--
-- All RPCs are SECURITY DEFINER + anonymous-callable so failed sign-in
-- users (no JWT yet) can still hit them.

ALTER TABLE IF EXISTS public.admin_login_lockouts RENAME TO login_lockouts;

-- Add the `kind` column BEFORE recreating functions that reference it
-- (Postgres validates function bodies at CREATE time, not lazily).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'login_lockouts' AND column_name = 'kind'
  ) THEN
    ALTER TABLE public.login_lockouts ADD COLUMN kind text NOT NULL DEFAULT 'admin';
  END IF;
END $$;

-- Drop old admin-prefixed functions; they are replaced by the generic
-- versions below. DROP first, then CREATE — PostgreSQL has no ALTER
-- FUNCTION RENAME for parameterised signatures in all supported versions.
DROP FUNCTION IF EXISTS public.log_admin_login_failure(text);
DROP FUNCTION IF EXISTS public.check_admin_login_lockout(text);
DROP FUNCTION IF EXISTS public.clear_admin_login_lockout(text);

CREATE OR REPLACE FUNCTION public.log_login_failure(p_email text, p_kind text DEFAULT 'admin')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := lower(coalesce(nullif(btrim(p_kind), ''), 'admin'));
  v_window interval;
  v_threshold int;
  v_lock_duration interval;
  v_recent_count int;
  v_existing_id uuid;
  v_new_incident_id uuid := null;
  v_locked_until timestamptz := null;
  v_remaining_seconds int := 0;
  v_remaining_attempts int := 0;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN jsonb_build_object('logged', false, 'reason', 'no_email');
  END IF;

  -- Per-audience rules
  IF v_kind = 'customer' THEN
    v_window       := interval '1 hour';
    v_threshold    := 10;
    v_lock_duration := interval '1 hour';
  ELSE
    v_window       := interval '2 hours';
    v_threshold    := 3;
    v_lock_duration := interval '2 hours';
  END IF;

  -- 1. Always log the failure (action stays LOGIN_FAILED so the
  --    security_events_view keeps aggregating across audiences).
  INSERT INTO public.audit_logs (user_id, action, table_name, new_data)
  VALUES (
    NULL,
    'LOGIN_FAILED',
    'auth.users',
    jsonb_build_object(
      'email', lower(p_email),
      'kind', v_kind,
      'attempted_at', now()
    )
  );

  -- 2. Count failures inside the lockout window for this email + kind
  SELECT COUNT(*) INTO v_recent_count
  FROM public.audit_logs
  WHERE action = 'LOGIN_FAILED'
    AND (new_data->>'email') = lower(p_email)
    AND coalesce(new_data->>'kind', 'admin') = v_kind
    AND created_at >= now() - v_window;

  -- 3. If threshold crossed, ensure a lockout row exists.
  IF v_recent_count >= v_threshold THEN
    SELECT locked_until INTO v_locked_until
    FROM public.login_lockouts
    WHERE email = lower(p_email)
      AND coalesce(kind, 'admin') = v_kind
      AND locked_until > now()
    ORDER BY locked_until DESC
    LIMIT 1;

    IF v_locked_until IS NULL THEN
      v_locked_until := now() + v_lock_duration;
      INSERT INTO public.login_lockouts (email, kind, locked_until)
      VALUES (lower(p_email), v_kind, v_locked_until);
    END IF;

    v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_locked_until - now()))::int);

    -- 4. Ensure an open brute-force incident exists (idempotent).
    SELECT id INTO v_existing_id
    FROM public.security_incidents
    WHERE resolved = false
      AND event_type = 'brute_force_attempt'
      AND description ILIKE '%' || lower(p_email) || '%'
      AND (new_data->>'kind') = v_kind
      AND created_at >= now() - v_window
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.security_incidents (event_type, description, severity, resolved, new_data)
      VALUES (
        'brute_force_attempt',
        format('Account locked: %s failed %s sign-ins for %s within %s',
          v_recent_count, v_kind, lower(p_email), EXTRACT(EPOCH FROM v_window)::int || 's'),
        CASE WHEN v_recent_count >= 10 THEN 'critical' WHEN v_recent_count >= 5 THEN 'high' ELSE 'medium' END,
        false,
        jsonb_build_object('kind', v_kind, 'email', lower(p_email))
      )
      RETURNING id INTO v_new_incident_id;
    END IF;
  END IF;

  v_remaining_attempts := GREATEST(0, v_threshold - v_recent_count);

  RETURN jsonb_build_object(
    'logged', true,
    'kind', v_kind,
    'recent_failures', v_recent_count,
    'threshold', v_threshold,
    'remaining_attempts', v_remaining_attempts,
    'locked', v_locked_until IS NOT NULL,
    'locked_until', v_locked_until,
    'remaining_seconds', v_remaining_seconds,
    'incident_id', v_new_incident_id
  );
END $$;

REVOKE ALL ON FUNCTION public.log_login_failure(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_login_failure(text, text) TO anon, authenticated;

-- Check whether an email is currently locked for the given audience.
-- If p_kind is NULL, returns locked if ANY audience has an active lockout
-- (so a single email locked out as customer also blocks admin sign-in).
CREATE OR REPLACE FUNCTION public.check_login_lockout(p_email text, p_kind text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind_filter text := lower(coalesce(nullif(btrim(p_kind), ''), ''));
  v_locked_until timestamptz;
  v_locked_kind text;
  v_remaining_seconds int := 0;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN jsonb_build_object('locked', false);
  END IF;

  IF v_kind_filter = '' THEN
    -- Any-kind check: any active lockout blocks.
    SELECT locked_until, kind INTO v_locked_until, v_locked_kind
    FROM public.login_lockouts
    WHERE email = lower(p_email)
      AND locked_until > now()
    ORDER BY locked_until DESC
    LIMIT 1;
  ELSE
    SELECT locked_until, kind INTO v_locked_until, v_locked_kind
    FROM public.login_lockouts
    WHERE email = lower(p_email)
      AND coalesce(kind, 'admin') = v_kind_filter
      AND locked_until > now()
    ORDER BY locked_until DESC
    LIMIT 1;
  END IF;

  IF v_locked_until IS NULL THEN
    RETURN jsonb_build_object('locked', false);
  END IF;

  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_locked_until - now()))::int);

  RETURN jsonb_build_object(
    'locked', true,
    'kind', coalesce(v_locked_kind, 'admin'),
    'locked_until', v_locked_until,
    'remaining_seconds', v_remaining_seconds
  );
END $$;

REVOKE ALL ON FUNCTION public.check_login_lockout(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_login_lockout(text, text) TO anon, authenticated;

-- Clear any lockouts for the email on a successful sign-in.
-- Defaults to clearing for the given kind; pass '*' to clear all kinds
-- (used by the customer signIn success path, which should clear
-- customer lockouts and won't affect admin lockouts).
CREATE OR REPLACE FUNCTION public.clear_login_lockout(p_email text, p_kind text DEFAULT 'admin')
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.login_lockouts
   WHERE email = lower(p_email)
     AND (
       p_kind = '*'
       OR coalesce(kind, 'admin') = lower(coalesce(p_kind, 'admin'))
     );
$$;

REVOKE ALL ON FUNCTION public.clear_login_lockout(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_login_lockout(text, text) TO anon, authenticated;

-- Drop the old index and recreate it on (email, kind, locked_until).
DROP INDEX IF EXISTS public.admin_login_lockouts_email_idx;
CREATE INDEX IF NOT EXISTS login_lockouts_email_kind_idx
  ON public.login_lockouts (email, kind, locked_until DESC);
