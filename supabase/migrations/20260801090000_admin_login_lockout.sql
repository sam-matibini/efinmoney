-- Security Monitoring: enforce a 5-failed-attempts / 2-hour lockout per
-- admin email, server-side, so it works even if the client is bypassed.
--
-- Replaces the prior "open an incident at 3 failures" behaviour with an
-- actual block: once 5 failed admin sign-ins for the same email occur
-- within 2 hours, the email is locked for 2 hours and the password
-- attempt is short-circuited before it ever reaches Supabase Auth.
--
-- The lockout table is keyed on lower(email) (matches the existing
-- log_admin_login_failure normalisation). On a successful sign-in the
-- row is cleared, so a legitimate user who fixed the typo isn't penalised.
--
-- SECURITY DEFINER so audit_logs / admin_login_lockouts RLS doesn't gate
-- the writer. Callable by anon (failed sign-in users have no JWT yet).

CREATE TABLE IF NOT EXISTS public.admin_login_lockouts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  locked_until timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_login_lockouts_email_idx
  ON public.admin_login_lockouts (email, locked_until DESC);

ALTER TABLE public.admin_login_lockouts ENABLE ROW LEVEL SECURITY;

-- No policies: the table is only read/written by SECURITY DEFINER RPCs.
-- service_role bypasses RLS, authenticated/anon are denied by default.

CREATE OR REPLACE FUNCTION public.log_admin_login_failure(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window interval := interval '2 hours';
  v_threshold int := 5;
  v_lock_duration interval := interval '2 hours';
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

  -- 1. Always log the failure
  INSERT INTO public.audit_logs (user_id, action, table_name, new_data)
  VALUES (
    NULL,
    'LOGIN_FAILED',
    'auth.users',
    jsonb_build_object('email', lower(p_email), 'attempted_at', now())
  );

  -- 2. Count failures inside the lockout window
  SELECT COUNT(*) INTO v_recent_count
  FROM public.audit_logs
  WHERE action = 'LOGIN_FAILED'
    AND (new_data->>'email') = lower(p_email)
    AND created_at >= now() - v_window;

  -- 3. If threshold crossed, ensure a lockout row exists for 2h from now
  IF v_recent_count >= v_threshold THEN
    -- Check if a lockout is already active
    SELECT locked_until INTO v_locked_until
    FROM public.admin_login_lockouts
    WHERE email = lower(p_email)
      AND locked_until > now()
    ORDER BY locked_until DESC
    LIMIT 1;

    IF v_locked_until IS NULL THEN
      v_locked_until := now() + v_lock_duration;
      INSERT INTO public.admin_login_lockouts (email, locked_until)
      VALUES (lower(p_email), v_locked_until);
    END IF;

    v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_locked_until - now()))::int);

    -- 4. Ensure an open brute-force incident exists (idempotent)
    SELECT id INTO v_existing_id
    FROM public.security_incidents
    WHERE resolved = false
      AND description ILIKE '%' || lower(p_email) || '%'
      AND created_at >= now() - v_window
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.security_incidents (event_type, description, severity, resolved)
      VALUES (
        'brute_force_attempt',
        format('Account locked: %s failed admin sign-ins for %s within 2 hours', v_recent_count, lower(p_email)),
        CASE WHEN v_recent_count >= 10 THEN 'critical' WHEN v_recent_count >= 5 THEN 'high' ELSE 'medium' END,
        false
      )
      RETURNING id INTO v_new_incident_id;
    END IF;
  END IF;

  -- 5. Compute remaining attempts (never negative)
  v_remaining_attempts := GREATEST(0, v_threshold - v_recent_count);

  RETURN jsonb_build_object(
    'logged', true,
    'recent_failures', v_recent_count,
    'threshold', v_threshold,
    'remaining_attempts', v_remaining_attempts,
    'locked', v_locked_until IS NOT NULL,
    'locked_until', v_locked_until,
    'remaining_seconds', v_remaining_seconds,
    'incident_id', v_new_incident_id
  );
END $$;

REVOKE ALL ON FUNCTION public.log_admin_login_failure(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_login_failure(text) TO anon, authenticated;

-- Check whether an email is currently locked. Returns null + locked=false
-- when no active lockout; locked=true + locked_until when locked.
CREATE OR REPLACE FUNCTION public.check_admin_login_lockout(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked_until timestamptz;
  v_remaining_seconds int := 0;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RETURN jsonb_build_object('locked', false);
  END IF;

  SELECT locked_until INTO v_locked_until
  FROM public.admin_login_lockouts
  WHERE email = lower(p_email)
    AND locked_until > now()
  ORDER BY locked_until DESC
  LIMIT 1;

  IF v_locked_until IS NULL THEN
    RETURN jsonb_build_object('locked', false);
  END IF;

  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_locked_until - now()))::int);

  RETURN jsonb_build_object(
    'locked', true,
    'locked_until', v_locked_until,
    'remaining_seconds', v_remaining_seconds
  );
END $$;

REVOKE ALL ON FUNCTION public.check_admin_login_lockout(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_admin_login_lockout(text) TO anon, authenticated;

-- Clear any lockout for the email on a successful admin sign-in.
-- Called from the client after signInWithPassword succeeds.
CREATE OR REPLACE FUNCTION public.clear_admin_login_lockout(p_email text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.admin_login_lockouts WHERE email = lower(p_email);
$$;

REVOKE ALL ON FUNCTION public.clear_admin_login_lockout(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_admin_login_lockout(text) TO anon, authenticated;
