
-- 1) Vendor T4A / subcontractor fields
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS vendor_type text NOT NULL DEFAULT 'supplier',
  ADD COLUMN IF NOT EXISTS is_subcontractor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS t4a_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_legal_name text,
  ADD COLUMN IF NOT EXISTS sin_or_bn text,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS cra_t4a_box text DEFAULT '048';

-- 2) Attachments table for purchases module
CREATE TABLE IF NOT EXISTS public.purchase_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type text NOT NULL CHECK (parent_type IN ('bill','po','expense_claim','expense_item','grn','quick_expense')),
  parent_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_attachments_parent ON public.purchase_attachments(parent_type, parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_attachments TO authenticated;
GRANT ALL ON public.purchase_attachments TO service_role;
ALTER TABLE public.purchase_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users read attachments"
  ON public.purchase_attachments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "auth users insert attachments"
  ON public.purchase_attachments FOR INSERT
  TO authenticated WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "owner or admin delete attachment"
  ON public.purchase_attachments FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- 3) T4A YTD totals view (covers fully completed vendor_bill_payments)
CREATE OR REPLACE VIEW public.t4a_ytd_totals AS
SELECT
  v.id AS vendor_id,
  v.name AS vendor_name,
  v.business_legal_name,
  v.sin_or_bn,
  v.cra_t4a_box,
  EXTRACT(YEAR FROM p.paid_at)::int AS tax_year,
  SUM(p.amount)::numeric(18,2) AS gross_paid,
  COUNT(*)::int AS payment_count
FROM public.vendors v
JOIN public.purchase_bills b ON b.vendor_id = v.id
JOIN public.vendor_bill_payments p ON p.bill_id = b.id
WHERE v.t4a_eligible = true
  AND p.status = 'completed'
  AND p.paid_at IS NOT NULL
GROUP BY v.id, v.name, v.business_legal_name, v.sin_or_bn, v.cra_t4a_box, EXTRACT(YEAR FROM p.paid_at);

GRANT SELECT ON public.t4a_ytd_totals TO authenticated, service_role;
