
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
-- Existing "Users can insert own notifications" policy already allows auth.uid() = user_id.
-- The notify_transfer_event trigger is SECURITY DEFINER owned by postgres, which bypasses RLS.
