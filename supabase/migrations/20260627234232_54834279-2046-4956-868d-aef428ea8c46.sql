
CREATE POLICY "purchase-docs read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'purchase-documents');

CREATE POLICY "purchase-docs insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'purchase-documents' AND owner = auth.uid());

CREATE POLICY "purchase-docs delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'purchase-documents' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));
