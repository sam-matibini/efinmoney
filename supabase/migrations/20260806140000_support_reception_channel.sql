-- Extend support_threads channel enum to include 'reception' (Reception AI bookings & calls).
-- The UI already renders the "Reception AI" chip for this channel value.

ALTER TABLE public.support_threads
  DROP CONSTRAINT IF EXISTS support_threads_channel_check;

ALTER TABLE public.support_threads
  ADD CONSTRAINT support_threads_channel_check
  CHECK (channel IN ('app','contact','chat','reception'));
