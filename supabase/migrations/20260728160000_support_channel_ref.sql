-- Live-chat (tawk.to) support threads.
-- Threads sourced from tawk.to are keyed by the external chat id so the webhook
-- is idempotent (chat:start + transcript retries map to one thread). A chat
-- visitor may give no email, so a thread is now also identifiable by its
-- external ref alone.

ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS channel_ref text;

CREATE INDEX IF NOT EXISTS idx_support_threads_channel_ref
  ON public.support_threads (channel_ref) WHERE channel_ref IS NOT NULL;

-- A live-chat thread is identifiable by its external chat id even when the
-- visitor gave no email — allow channel_ref as a third identity.
ALTER TABLE public.support_threads
  DROP CONSTRAINT IF EXISTS support_threads_identity_chk;
ALTER TABLE public.support_threads
  ADD CONSTRAINT support_threads_identity_chk
  CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL OR channel_ref IS NOT NULL);
