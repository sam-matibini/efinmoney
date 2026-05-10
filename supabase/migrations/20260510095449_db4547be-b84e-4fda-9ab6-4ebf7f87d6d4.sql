
-- 1. Additive columns on kyc_verifications
ALTER TABLE public.kyc_verifications
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS escalated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

-- 2. Optional display name on admin_users
ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS full_name text;

-- 3. Admin notifications table
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_created
  ON public.admin_notifications(admin_id, created_at DESC);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read own notifications" ON public.admin_notifications;
CREATE POLICY "Admins read own notifications"
  ON public.admin_notifications FOR SELECT
  USING (auth.uid() = admin_id);

DROP POLICY IF EXISTS "Admins update own notifications" ON public.admin_notifications;
CREATE POLICY "Admins update own notifications"
  ON public.admin_notifications FOR UPDATE
  USING (auth.uid() = admin_id);

DROP POLICY IF EXISTS "Admins delete own notifications" ON public.admin_notifications;
CREATE POLICY "Admins delete own notifications"
  ON public.admin_notifications FOR DELETE
  USING (auth.uid() = admin_id);

-- 4. KYC reviewer policies on kyc_verifications (additive — keep existing user policies)
DROP POLICY IF EXISTS "KYC reviewers can view all verifications" ON public.kyc_verifications;
CREATE POLICY "KYC reviewers can view all verifications"
  ON public.kyc_verifications FOR SELECT
  USING (public.is_kyc_reviewer(auth.uid()));

DROP POLICY IF EXISTS "KYC reviewers can update all verifications" ON public.kyc_verifications;
CREATE POLICY "KYC reviewers can update all verifications"
  ON public.kyc_verifications FOR UPDATE
  USING (public.is_kyc_reviewer(auth.uid()));

-- 5. Audit log policies for admins
DROP POLICY IF EXISTS "Admins can view audit log" ON public.kyc_audit_log;
CREATE POLICY "Admins can view audit log"
  ON public.kyc_audit_log FOR SELECT
  USING (public.is_admin_user(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert audit log" ON public.kyc_audit_log;
CREATE POLICY "Admins can insert audit log"
  ON public.kyc_audit_log FOR INSERT
  WITH CHECK (public.is_admin_user(auth.uid()));

-- 6. Realtime
ALTER TABLE public.kyc_verifications REPLICA IDENTITY FULL;
ALTER TABLE public.admin_notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kyc_verifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
