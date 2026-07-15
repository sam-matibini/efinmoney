ALTER TABLE public.support_threads
  ADD COLUMN priority     text        NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN escalated_at timestamptz;
