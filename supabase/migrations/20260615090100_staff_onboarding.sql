-- Staff onboarding (part 2/2): lifecycle status, onboarding profile + ID document,
-- staff-documents storage bucket, staff audit log, and supporting RLS/helpers.

-- ============== STATUS ENUM ==============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_status') THEN
    CREATE TYPE public.admin_status AS ENUM (
      'invited', 'pending_review', 'active', 'rejected', 'suspended'
    );
  END IF;
END $$;

-- ============== ADMIN_USERS: onboarding columns ==============
-- Existing admins default to 'active' so nothing breaks; freshly invited staff
-- are explicitly inserted as 'invited' by the admin-invite-staff edge function.
ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS status public.admin_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS id_document_type text,
  ADD COLUMN IF NOT EXISTS id_document_url text,
  ADD COLUMN IF NOT EXISTS document_status text NOT NULL DEFAULT 'pending';

-- ============== HELPERS ==============
-- Only active admins count as admins for data-access purposes. Invited /
-- pending_review / rejected / suspended staff get NO access to user data.
CREATE OR REPLACE FUNCTION public.is_active_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE id = _uid AND status = 'active'
  );
$$;

-- Tighten existing helpers to require active status.
CREATE OR REPLACE FUNCTION public.is_admin_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE id = _uid AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_kyc_reviewer(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = _uid AND status = 'active'
      AND role IN ('super_admin', 'compliance_officer')
  );
$$;

-- ============== SELF-SERVICE ONBOARDING POLICY + GUARD ==============
-- Staff may update their own row during onboarding, but a trigger prevents
-- privilege escalation (changing own role/status/email/review fields).
DROP POLICY IF EXISTS "Staff update own onboarding" ON public.admin_users;
CREATE POLICY "Staff update own onboarding"
  ON public.admin_users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.protect_admin_privileged_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Super admins (and service-role updates where auth.uid() is null) bypass.
  IF auth.uid() IS NULL OR public.is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = NEW.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'You cannot change your own role';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'You cannot change your email';
    END IF;
    IF NEW.document_status IS DISTINCT FROM OLD.document_status THEN
      RAISE EXCEPTION 'You cannot change your document review status';
    END IF;
    IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
      RAISE EXCEPTION 'You cannot change review metadata';
    END IF;
    -- Status: only the invited -> pending_review submission is allowed.
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'invited' AND NEW.status = 'pending_review') THEN
      RAISE EXCEPTION 'Invalid status transition';
    END IF;
    RETURN NEW;
  END IF;

  -- Non-super-admins cannot edit other staff rows at all.
  RAISE EXCEPTION 'Insufficient permissions to modify staff records';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_admin_privileged_fields ON public.admin_users;
CREATE TRIGGER trg_protect_admin_privileged_fields
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.protect_admin_privileged_fields();

-- ============== STAFF AUDIT LOG ==============
CREATE TABLE IF NOT EXISTS public.staff_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_audit_log_target_created
  ON public.staff_audit_log(target_admin_id, created_at DESC);

ALTER TABLE public.staff_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active admins read staff audit" ON public.staff_audit_log;
CREATE POLICY "Active admins read staff audit"
  ON public.staff_audit_log FOR SELECT TO authenticated
  USING (public.is_active_admin(auth.uid()));

-- ============== STAFF DOCUMENTS BUCKET ==============
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-documents', 'staff-documents', false, 10485760,
  ARRAY['image/jpeg','image/png','image/jpg','application/pdf']
) ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Staff upload own documents" ON storage.objects;
CREATE POLICY "Staff upload own documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'staff-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Staff view own documents" ON storage.objects;
CREATE POLICY "Staff view own documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_kyc_reviewer(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Staff update own documents" ON storage.objects;
CREATE POLICY "Staff update own documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Super admins delete staff documents" ON storage.objects;
CREATE POLICY "Super admins delete staff documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_super_admin(auth.uid())
    )
  );
