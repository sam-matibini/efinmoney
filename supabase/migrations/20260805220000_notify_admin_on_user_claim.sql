-- =====================================================================
-- Phase 5: Notify the onboarding admin when a user claims their invite.
--
-- When a user created via the Developer tab (onboarded_by_admin_id set)
-- signs in for the first time (last_sign_in_at NULL → non-NULL), insert
-- a row into admin_notifications. The admin's bell icon is already
-- subscribed to this table in AdminLayout.tsx (realtime).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_admin_on_user_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_onboarded_by_admin_id uuid;
  v_user_email text;
BEGIN
  -- Only fire on the first sign-in: last_sign_in_at NULL → non-NULL.
  IF OLD.last_sign_in_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.last_sign_in_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find the onboarding admin and user email
  SELECT onboarded_by_admin_id, email
  INTO v_onboarded_by_admin_id, v_user_email
  FROM public.profiles
  WHERE user_id = NEW.id;

  -- Self-signup (no admin) — nothing to do
  IF v_onboarded_by_admin_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.admin_notifications (admin_id, type, payload)
  VALUES (
    v_onboarded_by_admin_id,
    'onboarded_user_claimed',
    jsonb_build_object(
      'user_id', NEW.id,
      'user_email', v_user_email,
      'claimed_at', NEW.last_sign_in_at
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_on_user_claim ON auth.users;
CREATE TRIGGER trg_notify_admin_on_user_claim
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.notify_admin_on_user_claim();
