
-- Ensure pg_net is available for async HTTP from triggers
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper: post to send-email edge function
CREATE OR REPLACE FUNCTION public.invoke_send_email(p_type text, p_to text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text := 'https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/send-email';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbXNrY3ZhZWFkbnlvdmJyb3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MTYwNDAsImV4cCI6MjA4MzQ5MjA0MH0.RLEn7EDysi6kgT9t_dOm92uwC5BeAU495wrDtvHypyM';
BEGIN
  IF p_to IS NULL OR p_to = '' THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('type', p_type, 'to', p_to, 'data', p_data)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_send_email failed: %', SQLERRM;
END;
$$;

-- 1. KYC status change notification + email
CREATE OR REPLACE FUNCTION public.notify_kyc_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    INSERT INTO public.notifications (user_id, title, message, type, is_read)
    VALUES (
      NEW.user_id,
      'KYC Status Updated',
      format('Your KYC status is now: %s', NEW.kyc_status),
      'kyc',
      false
    );

    PERFORM public.invoke_send_email(
      'kyc_update',
      NEW.email,
      jsonb_build_object('status', NEW.kyc_status, 'tier', NEW.kyc_tier)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_kyc_status_change ON public.profiles;
CREATE TRIGGER trg_notify_kyc_status_change
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.notify_kyc_status_change();

-- 2. Compliance alert notifications
CREATE OR REPLACE FUNCTION public.notify_compliance_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (
    NEW.user_id,
    'Compliance Alert',
    format('A %s severity compliance alert was raised on your account.', NEW.severity),
    'compliance',
    false
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_compliance_alert ON public.compliance_alerts;
CREATE TRIGGER trg_notify_compliance_alert
AFTER INSERT ON public.compliance_alerts
FOR EACH ROW EXECUTE FUNCTION public.notify_compliance_alert();

-- 3. Extend transfer-event trigger to also send completion email
CREATE OR REPLACE FUNCTION public.notify_transfer_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_message text;
  v_email text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_title := 'Transfer Initiated';
    v_message := format('Your transfer of %s %s to %s has been initiated.',
      NEW.source_amount, NEW.source_currency, NEW.recipient_name);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text = 'completed' THEN
      v_title := 'Transfer Completed';
      v_message := format('Your transfer of %s %s to %s is completed.',
        NEW.source_amount, NEW.source_currency, NEW.recipient_name);

      SELECT email INTO v_email FROM public.profiles WHERE user_id = NEW.sender_id;
      PERFORM public.invoke_send_email(
        'transfer_completed',
        v_email,
        jsonb_build_object(
          'recipient_name', NEW.recipient_name,
          'source_amount', NEW.source_amount,
          'source_currency', NEW.source_currency,
          'reference', COALESCE(NEW.provider_reference, NEW.id::text),
          'id', NEW.id
        )
      );
    ELSIF NEW.status::text = 'failed' THEN
      v_title := 'Transfer Failed';
      v_message := format('Your transfer of %s %s to %s has failed.',
        NEW.source_amount, NEW.source_currency, NEW.recipient_name);
    ELSIF NEW.status::text = 'cancelled' THEN
      v_title := 'Transfer Cancelled';
      v_message := format('Your transfer of %s %s to %s was cancelled.',
        NEW.source_amount, NEW.source_currency, NEW.recipient_name);
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (NEW.sender_id, v_title, v_message, 'transfer', false);

  RETURN NEW;
END;
$$;

-- 4. Welcome email on signup (extends handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email)
    VALUES (NEW.id, NEW.email);

    INSERT INTO public.wallets (user_id, currency_code, is_default) VALUES
        (NEW.id, 'USD', true),
        (NEW.id, 'CAD', false);

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');

    PERFORM public.invoke_send_email(
      'welcome',
      NEW.email,
      jsonb_build_object('name', COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
    );

    RETURN NEW;
END;
$$;
