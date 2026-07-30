-- KYB admin: applicant messaging + admin document upload on behalf of applicant.
--
-- The existing on_kyb_status_change trigger already records every status
-- transition into business_kyb_audit_log with prev/new status, the reviewer's
-- auth.uid(), and the timestamp, so "save + timestamp" is structural. This
-- migration adds (a) a free-form applicant <-> admin thread that lives outside
-- status changes, and (b) the storage + audit grants the admin needs to upload
-- a replacement document on behalf of an applicant and have it show up in the
-- audit trail.

-- ============== applicant <-> reviewer thread ==============
CREATE TABLE IF NOT EXISTS public.business_kyb_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_profile_id uuid NOT NULL
    REFERENCES public.business_profiles(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('admin','applicant')),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_kyb_messages_profile
  ON public.business_kyb_messages (business_profile_id, created_at);

GRANT SELECT, INSERT ON public.business_kyb_messages TO authenticated;
GRANT ALL ON public.business_kyb_messages TO service_role;
ALTER TABLE public.business_kyb_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_kyb_messages_select" ON public.business_kyb_messages;
CREATE POLICY "business_kyb_messages_select" ON public.business_kyb_messages
  FOR SELECT TO authenticated
  USING (
    public.is_kyb_reviewer(auth.uid())
    OR public.owns_business(auth.uid(), business_profile_id)
  );

-- Reviewers can post as either role; applicants can only post as themselves.
DROP POLICY IF EXISTS "business_kyb_messages_insert" ON public.business_kyb_messages;
CREATE POLICY "business_kyb_messages_insert" ON public.business_kyb_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND (
      public.is_kyb_reviewer(auth.uid())
      OR (
        author_role = 'applicant'
        AND public.owns_business(auth.uid(), business_profile_id)
      )
    )
  );

-- ============== storage: allow reviewers to upload on behalf of applicant ==============
-- The path convention is <owner_user_id>/<business_profile_id>/<doc>-<ts>.<ext>.
-- The reviewer already owns the right to read every applicant's bucket folder
-- (see business_docs_select), so writing to the same folder under the same key
-- shape keeps the file path predictable for both the applicant and the review UI.
DROP POLICY IF EXISTS "business_docs_insert" ON storage.objects;
CREATE POLICY "business_docs_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'business-documents'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_kyb_reviewer(auth.uid())
  )
);

-- ============== audit log: reviewers may insert non-status rows ==============
-- The BEFORE UPDATE trigger on business_profiles already writes status rows
-- with the reviewer's auth.uid(). This grant lets the client also record
-- non-status actions (e.g. doc uploaded on behalf of applicant) so they appear
-- in the same trail the reviewer already reads.
GRANT INSERT ON public.business_kyb_audit_log TO authenticated;

DROP POLICY IF EXISTS "business_kyb_audit_insert_reviewer" ON public.business_kyb_audit_log;
CREATE POLICY "business_kyb_audit_insert_reviewer" ON public.business_kyb_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_kyb_reviewer(auth.uid())
    AND admin_id = auth.uid()
  );
