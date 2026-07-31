CREATE POLICY "Staff can read communication attachment files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'communication-attachments'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'support'::app_role)
    OR has_role(auth.uid(), 'compliance'::app_role)
  )
);

CREATE POLICY "Staff can upload communication attachment files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'communication-attachments'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'support'::app_role)
  )
);

CREATE POLICY "Staff can delete communication attachment files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'communication-attachments'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'support'::app_role)
  )
);