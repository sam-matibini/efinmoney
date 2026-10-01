-- Production was missing the SELECT/UPDATE/DELETE policies on kyc-documents.
-- Client uploads use upsert, which Storage only allows with SELECT + UPDATE as well as INSERT.
DROP POLICY IF EXISTS "Users view own kyc files" ON storage.objects;
CREATE POLICY "Users view own kyc files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin_user(auth.uid())
      OR public.is_kyc_reviewer(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users update own kyc files" ON storage.objects;
CREATE POLICY "Users update own kyc files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'kyc-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own kyc files" ON storage.objects;
CREATE POLICY "Users delete own kyc files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin_user(auth.uid())
    )
  );
