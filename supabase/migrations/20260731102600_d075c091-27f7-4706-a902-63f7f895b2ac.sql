ALTER TABLE public.customer_communications
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE TABLE public.communication_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id uuid NOT NULL REFERENCES public.customer_communications(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_communication_attachments_comm ON public.communication_attachments(communication_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_attachments TO authenticated;
GRANT ALL ON public.communication_attachments TO service_role;

ALTER TABLE public.communication_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view communication attachments"
ON public.communication_attachments FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'support'::app_role)
  OR has_role(auth.uid(), 'compliance'::app_role)
);

CREATE POLICY "Staff can add communication attachments"
ON public.communication_attachments FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'support'::app_role)
);

CREATE POLICY "Staff can remove communication attachments"
ON public.communication_attachments FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'support'::app_role)
);