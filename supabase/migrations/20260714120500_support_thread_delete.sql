-- Add DELETE policies for support_threads (user can delete own, staff can delete all)

ALTER TABLE public.support_threads ENABLE ROW LEVEL SECURITY;

-- Users can delete their own threads
DROP POLICY IF EXISTS st_user_delete ON public.support_threads;
CREATE POLICY st_user_delete ON public.support_threads
  FOR DELETE USING (user_id = auth.uid());

GRANT DELETE ON public.support_threads TO authenticated;
GRANT DELETE ON public.support_messages TO authenticated;
