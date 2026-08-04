-- =====================================================================
-- eFinMoney — run this once in your Supabase SQL Editor.
-- Covers: (1) staff training compliance, (2) Reception AI -> support inbox,
--         (3) Global Affairs Canada sanctions auto-pull.
-- Safe to re-run: every statement is idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Staff training
-- ---------------------------------------------------------------------
ALTER TABLE public.training_courses
  ADD COLUMN IF NOT EXISTS pass_mark integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS applies_to_roles text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.training_records
  ADD COLUMN IF NOT EXISTS recorded_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS training_courses_name_uniq
  ON public.training_courses (course_name);

CREATE INDEX IF NOT EXISTS training_records_staff_course_idx
  ON public.training_records (staff_id, course_id);

-- Mandatory FINTRAC-facing curriculum (idempotent)
INSERT INTO public.training_courses (course_name, category, frequency_months, is_mandatory, pass_mark)
VALUES
  ('AML/ATF Fundamentals',              'aml',          12, true, 80),
  ('Sanctions & Screening',             'sanctions',    12, true, 80),
  ('Suspicious Transaction Reporting',  'compliance',   12, true, 80),
  ('Privacy & PIPEDA',                  'data_privacy', 24, true, 70),
  ('Fraud & Security Awareness',        'fraud',        12, true, 70)
ON CONFLICT (course_name) DO UPDATE
  SET category         = EXCLUDED.category,
      frequency_months = EXCLUDED.frequency_months,
      is_mandatory     = true,
      pass_mark        = EXCLUDED.pass_mark;

-- ---------------------------------------------------------------------
-- 2. Reception AI -> Support Inbox
-- ---------------------------------------------------------------------
ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS support_threads_external_uniq
  ON public.support_threads (external_source, external_ref)
  WHERE external_ref IS NOT NULL;

-- Allow the 'reception' channel value. If `channel` is a CHECK-constrained
-- text column this widens the constraint; if it is an enum, the DO block adds
-- the value instead.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_attribute a ON a.atttypid = t.oid
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE c.relname = 'support_threads' AND a.attname = 'channel' AND t.typtype = 'e'
  ) THEN
    BEGIN
      EXECUTE format(
        'ALTER TYPE %s ADD VALUE IF NOT EXISTS ''reception''',
        (SELECT t.typname FROM pg_type t
         JOIN pg_attribute a ON a.atttypid = t.oid
         JOIN pg_class c ON c.oid = a.attrelid
         WHERE c.relname = 'support_threads' AND a.attname = 'channel')
      );
    EXCEPTION WHEN others THEN NULL;
    END;
  ELSE
    BEGIN
      ALTER TABLE public.support_threads DROP CONSTRAINT IF EXISTS support_threads_channel_check;
      ALTER TABLE public.support_threads
        ADD CONSTRAINT support_threads_channel_check
        CHECK (channel IN ('app','contact','chat','reception'));
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Global Affairs Canada (SEMA) sanctions feed
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'aml_source') THEN
    BEGIN
      ALTER TYPE public.aml_source ADD VALUE IF NOT EXISTS 'gac';
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

ALTER TABLE public.geographic_risk_ratings
  ADD COLUMN IF NOT EXISTS canada_sanctions boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.sanctions_sync_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL,
  status        text NOT NULL DEFAULT 'success',
  rows_upserted integer NOT NULL DEFAULT 0,
  error         text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sanctions_sync_runs TO authenticated;
GRANT ALL    ON public.sanctions_sync_runs TO service_role;

ALTER TABLE public.sanctions_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read sanctions sync runs" ON public.sanctions_sync_runs;
CREATE POLICY "Staff can read sanctions sync runs"
  ON public.sanctions_sync_runs FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE INDEX IF NOT EXISTS sanctions_sync_runs_started_idx
  ON public.sanctions_sync_runs (started_at DESC);

-- ---------------------------------------------------------------------
-- 4. Daily 03:00 UTC sanctions refresh
--    Replace <PROJECT_REF> and <ANON_KEY> with your own project values.
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('sanctions-sync-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sanctions-sync-daily');

SELECT cron.schedule(
  'sanctions-sync-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sanctions-sync',
    headers := '{"Content-Type":"application/json","apikey":"<ANON_KEY>"}'::jsonb,
    body    := '{"scheduled":true}'::jsonb
  );
  $$
);
