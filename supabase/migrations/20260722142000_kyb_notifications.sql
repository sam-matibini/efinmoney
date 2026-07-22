-- KYB decision notifications, plus the stale-project-ref fix that makes any of
-- this actually deliver.
--
-- invoke_send_email has been posting to hgmskcvaeadnyovbroup.supabase.co, which
-- is not this project (dkdnwumllibwdlqbjkwy). Every call has been failing into
-- the EXCEPTION handler's RAISE WARNING, unseen. Repointing it here also
-- restores the welcome email on signup, which has been silently dead.
--
-- The URL and key now come from database settings rather than being hardcoded,
-- so the next project migration does not silently break delivery again.

-- ============== configurable endpoint ==============
CREATE OR REPLACE FUNCTION public.edge_function_url(p_function text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    current_setting('app.settings.functions_url', true),
    'https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1'
  ) || '/' || p_function;
$$;

-- send-email runs with verify_jwt = false and does not inspect the inbound
-- Authorization header, so no key is embedded here. If the project is ever
-- locked down, set app.settings.anon_key and the header is added automatically.
CREATE OR REPLACE FUNCTION public.invoke_send_email(p_type text, p_to text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_url     text := public.edge_function_url('send-email');
  v_key     text := current_setting('app.settings.anon_key', true);
  v_headers jsonb := jsonb_build_object('Content-Type', 'application/json');
BEGIN
  IF p_to IS NULL OR p_to = '' THEN RETURN; END IF;

  IF v_key IS NOT NULL AND v_key <> '' THEN
    v_headers := v_headers || jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'apikey', v_key
    );
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := v_headers,
    body    := jsonb_build_object('type', p_type, 'to', p_to, 'data', p_data)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_send_email failed: %', SQLERRM;
END;
$function$;

-- ============== KYB decision fan-out ==============
-- Writes the in-app notification and queues the email. Runs AFTER the status
-- change so it never blocks or rolls back the decision itself.
CREATE OR REPLACE FUNCTION public.after_kyb_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_title text;
  v_message text;
  v_type text;
BEGIN
  IF OLD.kyb_status IS NOT DISTINCT FROM NEW.kyb_status THEN
    RETURN NULL;
  END IF;

  IF NEW.kyb_status = 'approved' THEN
    v_type    := 'kyb_approved';
    v_title   := 'Business verified';
    v_message := NEW.legal_name || ' has been verified. Your business account is now active.';
  ELSIF NEW.kyb_status = 'rejected' THEN
    v_type    := 'kyb_rejected';
    v_title   := 'Business verification unsuccessful';
    v_message := 'We could not verify ' || NEW.legal_name || '. '
                 || COALESCE(NEW.rejection_reason, 'Please review your submission and resubmit.');
  ELSIF NEW.kyb_status = 'suspended' THEN
    v_type    := 'kyb_suspended';
    v_title   := 'Business account suspended';
    v_message := NEW.legal_name || ' has been suspended. '
                 || COALESCE(NEW.rejection_reason, 'Please contact support.');
  ELSIF NEW.kyb_status = 'pending_review' THEN
    v_type    := 'kyb_submitted';
    v_title   := 'Application received';
    v_message := 'We have received your application for ' || NEW.legal_name
                 || ' and will review it within 1-2 business days.';
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (NEW.owner_user_id, v_title, v_message, v_type);

  -- Prefer the business email the applicant gave us, fall back to the account.
  SELECT COALESCE(NEW.business_email, p.email) INTO v_email
    FROM public.profiles p WHERE p.user_id = NEW.owner_user_id;

  PERFORM public.invoke_send_email(
    'kyb_update',
    v_email,
    jsonb_build_object(
      'legal_name', NEW.legal_name,
      'status',     NEW.kyb_status::text,
      'reason',     NEW.rejection_reason,
      'tier',       NEW.kyb_tier::text
    )
  );

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_after_kyb_decision ON public.business_profiles;
CREATE TRIGGER trg_after_kyb_decision
  AFTER UPDATE OF kyb_status ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.after_kyb_decision();
