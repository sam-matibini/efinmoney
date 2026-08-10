-- Alice AI conversations sync into Support CRM (support_threads.channel = 'alice').
ALTER TABLE public.support_threads
  DROP CONSTRAINT IF EXISTS support_threads_channel_check;

ALTER TABLE public.support_threads
  ADD CONSTRAINT support_threads_channel_check
  CHECK (channel IN ('app','contact','chat','reception','alice'));
