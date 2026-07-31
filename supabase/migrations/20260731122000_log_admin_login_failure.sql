-- Security Monitoring: feed the LOGIN_FAILED counter and the
-- security_incidents table from failed admin sign-in attempts.
--
-- Wrapped in a single RPC so the threshold logic is server-side and
-- centralised. The client (AdminAuthContext.signIn) calls this with the
-- attempted email on every failed sign-in; the function:
--   1. writes a LOGIN_FAILED row to audit_logs
--   2. counts recent LOGIN_FAILED for that email (5 min window)
--   3. if the count crosses the threshold, opens a security_incidents row
--      (idempotent: a single open incident per email within the window)
--
-- SECURITY DEFINER so audit_logs / security_incidents RLS don't gate
-- the writer; callable by anon (failed sign-in users have no JWT yet).

CREATE OR REPLACE FUNCTION public.log_admin_login_failure(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window interval := interval '5 minutes';
  v_threshold int := 3;
  v_recent_count int;
  v_existing_id uuid;
  v_new_incident_id uuid := null;
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

  -- 2. Count failures inside the window
  SELECT COUNT(*) INTO v_recent_count
  FROM public.audit_logs
  WHERE action = 'LOGIN_FAILED'
    AND (new_data->>'email') = lower(p_email)
    AND created_at >= now() - v_window;

  -- 3. If threshold crossed, ensure an open incident exists
  IF v_recent_count >= v_threshold THEN
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
        format('%s failed admin sign-ins for %s within %s seconds', v_recent_count, lower(p_email), EXTRACT(EPOCH FROM v_window)::int),
        CASE WHEN v_recent_count >= 10 THEN 'critical' WHEN v_recent_count >= 5 THEN 'high' ELSE 'medium' END,
        false
      )
      RETURNING id INTO v_new_incident_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'logged', true,
    'recent_failures', v_recent_count,
    'threshold', v_threshold,
    'incident_id', v_new_incident_id
  );
END $$;

REVOKE ALL ON FUNCTION public.log_admin_login_failure(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_login_failure(text) TO anon, authenticated;
