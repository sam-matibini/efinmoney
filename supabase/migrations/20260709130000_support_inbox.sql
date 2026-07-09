-- Communication Hub (Phase 2): two-way support inbox.
--   support_threads   — one conversation per user request.
--   support_messages  — messages within a thread (user or staff).
-- A trigger keeps the thread's denormalized fields fresh and fires a
-- notification to the other side (user bell / admin_notifications).

-- ── tables ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_threads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject               text NOT NULL,
  status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','pending','resolved','closed')),
  assigned_to           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at       timestamptz NOT NULL DEFAULT now(),
  last_message_preview  text,
  unread_for_staff      boolean NOT NULL DEFAULT false,
  unread_for_user       boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    uuid NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender_role  text NOT NULL CHECK (sender_role IN ('user','staff')),
  sender_id    uuid NOT NULL,
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_threads_user ON public.support_threads (user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_threads_status ON public.support_threads (status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON public.support_messages (thread_id, created_at);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- threads: users own theirs; staff see/manage all
DROP POLICY IF EXISTS st_user_select ON public.support_threads;
CREATE POLICY st_user_select ON public.support_threads FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS st_user_insert ON public.support_threads;
CREATE POLICY st_user_insert ON public.support_threads FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS st_user_update ON public.support_threads;
CREATE POLICY st_user_update ON public.support_threads FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS st_staff_all ON public.support_threads;
CREATE POLICY st_staff_all ON public.support_threads FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','finance','compliance')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','finance','compliance')));

-- messages: users read/post in their own threads (as 'user'); staff full access
DROP POLICY IF EXISTS sm_user_select ON public.support_messages;
CREATE POLICY sm_user_select ON public.support_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));
DROP POLICY IF EXISTS sm_user_insert ON public.support_messages;
CREATE POLICY sm_user_insert ON public.support_messages FOR INSERT
  WITH CHECK (
    sender_role = 'user' AND sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.support_threads t WHERE t.id = thread_id AND t.user_id = auth.uid())
  );
DROP POLICY IF EXISTS sm_staff_all ON public.support_messages;
CREATE POLICY sm_staff_all ON public.support_messages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','finance','compliance')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','finance','compliance')));

GRANT SELECT, INSERT, UPDATE ON public.support_threads TO authenticated;
GRANT SELECT, INSERT ON public.support_messages TO authenticated;

-- ── trigger: maintain thread + notify the other side ──────────────────────
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

    INSERT INTO public.notifications (user_id, title, message, type, is_read)
    VALUES (v_user_id, 'Support replied', v_preview, 'support', false);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_support_message ON public.support_messages;
CREATE TRIGGER trg_on_support_message
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.on_support_message();

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_threads;
