-- ManualKycForm uploaded to {uid}/id/ and {uid}/selfie/, which the INSERT policy rejected.
-- Keep those folders accepted for clients still running the older build.
DROP POLICY IF EXISTS "Users upload to own kyc folder" ON storage.objects;
CREATE POLICY "Users upload to own kyc folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN ('identity', 'address', 'source-of-funds', 'id', 'selfie')
  );
