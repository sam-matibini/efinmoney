ALTER POLICY "Users upload to own kyc folder"
ON storage.objects
WITH CHECK (
  bucket_id = 'kyc-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] IN ('identity', 'address', 'source-of-funds')
);