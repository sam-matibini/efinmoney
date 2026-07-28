-- Guest (no-account) support threads.
-- Prospective customers reach us via the public Contact form (and, later, live
-- chat) with no login. This lets those messages land in the same
-- /admin/support inbox staff already reply from, instead of a one-way email.
-- A guest is identified by name + email; staff replies are emailed back.

-- ── schema ────────────────────────────────────────────────────────────────
ALTER TABLE public.support_threads
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS guest_name  text,
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS channel     text NOT NULL DEFAULT 'app'
    CHECK (channel IN ('app','contact','chat'));

-- Guest messages have no auth user behind them.
ALTER TABLE public.support_messages
  ALTER COLUMN sender_id DROP NOT NULL;

-- A thread is either a signed-in user OR a guest we can reply to by email.
ALTER TABLE public.support_threads
  DROP CONSTRAINT IF EXISTS support_threads_identity_chk;
ALTER TABLE public.support_threads
  ADD CONSTRAINT support_threads_identity_chk
  CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL);

-- ── trigger: guard the user-bell insert for guest threads ─────────────────
-- Identical to the original on_support_message, except a staff reply on a
-- guest thread (user_id IS NULL) must NOT insert into notifications
-- (notifications.user_id is NOT NULL) — the guest is emailed instead.
CREATE OR REPLACE FUNCTION public.on_support_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_assigned uuid;
  v_preview text := left(NEW.body, 140);
BEGIN
  SELECT user_id, assigned_to INTO v_user_id, v_assigned
  FROM public.support_threads WHERE id = NEW.thread_id;

  IF NEW.sender_role = 'user' THEN
    UPDATE public.support_threads
      SET last_message_at = now(), last_message_preview = v_preview,
          unread_for_staff = true, unread_for_user = false,
          status = CASE WHEN status IN ('resolved','closed') THEN 'open' ELSE status END,
          updated_at = now()
      WHERE id = NEW.thread_id;

    INSERT INTO public.admin_notifications (admin_id, type, payload)
    SELECT ur.user_id, 'support_message',
           jsonb_build_object('thread_id', NEW.thread_id, 'preview', v_preview)
    FROM (SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin','finance','compliance')) ur
    WHERE v_assigned IS NULL OR ur.user_id = v_assigned;
  ELSE
    UPDATE public.support_threads
      SET last_message_at = now(), last_message_preview = v_preview,
          unread_for_user = true, unread_for_staff = false, updated_at = now()
      WHERE id = NEW.thread_id;

    -- Only real accounts have an in-app bell; guests get an email reply.
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, is_read)
      VALUES (v_user_id, 'Support replied', v_preview, 'support', false);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
