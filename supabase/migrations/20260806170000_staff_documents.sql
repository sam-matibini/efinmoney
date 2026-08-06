-- Phase 3: Staff document vault
-- Creates staff_documents table, storage bucket, RLS, and storage policies.

-- ─── Ensure handle_updated_at exists ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── Storage bucket ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-documents',
  'staff-documents',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- ─── staff_documents table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_documents (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid        NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  doc_type      text        NOT NULL CHECK (doc_type IN (
                              'id_front','id_back','offer_letter','contract',
                              'nda','tax_form','certification','bank_letter','other'
                            )),
  storage_path  text        NOT NULL UNIQUE,
  file_name     text        NOT NULL,
  file_size     integer,
  mime_type     text,
  status        text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','verified','expired')),
  expires_at    date,
  notes         text,
  uploaded_by   uuid        REFERENCES public.admin_users(id) ON DELETE SET NULL,
  verified_by   uuid        REFERENCES public.admin_users(id) ON DELETE SET NULL,
  verified_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_documents_staff_id_idx ON public.staff_documents (staff_id);
CREATE INDEX IF NOT EXISTS staff_documents_status_idx   ON public.staff_documents (status);

CREATE OR REPLACE TRIGGER staff_documents_updated_at
  BEFORE UPDATE ON public.staff_documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── RLS on staff_documents ───────────────────────────────────────────────────
ALTER TABLE public.staff_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read own documents"         ON public.staff_documents;
DROP POLICY IF EXISTS "Staff insert own documents"       ON public.staff_documents;
DROP POLICY IF EXISTS "Staff delete own pending docs"    ON public.staff_documents;
DROP POLICY IF EXISTS "Admins read all staff documents"  ON public.staff_documents;
DROP POLICY IF EXISTS "Admins update staff documents"    ON public.staff_documents;
DROP POLICY IF EXISTS "Admins delete staff documents"    ON public.staff_documents;

CREATE POLICY "Staff read own documents"
  ON public.staff_documents FOR SELECT TO authenticated
  USING (
    staff_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND status = 'active')
  );

CREATE POLICY "Staff insert own documents"
  ON public.staff_documents FOR INSERT TO authenticated
  WITH CHECK (
    staff_id    = auth.uid()
    AND uploaded_by = auth.uid()
    AND status  = 'pending'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND status = 'active')
  );

CREATE POLICY "Staff delete own pending docs"
  ON public.staff_documents FOR DELETE TO authenticated
  USING (
    staff_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND status = 'active')
  );

CREATE POLICY "Admins read all staff documents"
  ON public.staff_documents FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Admins update staff documents"
  ON public.staff_documents FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND status = 'active'
        AND role IN ('super_admin','compliance_officer')
    )
  );

CREATE POLICY "Admins delete staff documents"
  ON public.staff_documents FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND status = 'active'
        AND role IN ('super_admin','compliance_officer')
    )
  );

-- Admins can also insert documents on behalf of staff (offer letters, contracts, etc.)
DROP POLICY IF EXISTS "Admins insert staff documents" ON public.staff_documents;
CREATE POLICY "Admins insert staff documents"
  ON public.staff_documents FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND status = 'active'
        AND role IN ('super_admin','compliance_officer')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_documents TO authenticated;

-- ─── Storage policies ─────────────────────────────────────────────────────────
-- Path structure: staff/{staff_uid}/{timestamp}-{type}-{filename}

DROP POLICY IF EXISTS "Staff upload own documents storage"   ON storage.objects;
DROP POLICY IF EXISTS "Staff read own documents storage"     ON storage.objects;
DROP POLICY IF EXISTS "Staff delete own documents storage"   ON storage.objects;
DROP POLICY IF EXISTS "Admins upload staff documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Admins read all staff documents storage" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete staff documents storage" ON storage.objects;

CREATE POLICY "Staff upload own documents storage"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'staff-documents'
    AND name LIKE 'staff/' || (auth.uid())::text || '/%'
    AND EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid() AND status = 'active')
  );

CREATE POLICY "Staff read own documents storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND name LIKE 'staff/' || (auth.uid())::text || '/%'
  );

CREATE POLICY "Staff delete own documents storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND name LIKE 'staff/' || (auth.uid())::text || '/%'
  );

CREATE POLICY "Admins upload staff documents storage"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'staff-documents'
    AND name LIKE 'staff/%'
    AND EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND status = 'active'
        AND role IN ('super_admin','compliance_officer')
    )
  );

CREATE POLICY "Admins read all staff documents storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Admins delete staff documents storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'staff-documents'
    AND EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE id = auth.uid() AND status = 'active'
        AND role IN ('super_admin','compliance_officer')
    )
  );
