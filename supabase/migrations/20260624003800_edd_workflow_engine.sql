-- EDD Workflow Engine (#11)
-- Automated Enhanced Due Diligence with questionnaires, documents, and approval routing.

CREATE TABLE IF NOT EXISTS public.edd_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  trigger_reason text NOT NULL CHECK (trigger_reason IN ('high_risk_jurisdiction', 'large_volume', 'pep_identified', 'sanctions_exposure', 'complex_ownership', 'manual')),
  status text NOT NULL DEFAULT 'pending_questionnaire' CHECK (status IN ('pending_questionnaire', 'documents_submitted', 'under_review', 'approved', 'rejected', 'more_info_needed')),
  assigned_to uuid REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.edd_questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edd_case_id uuid NOT NULL REFERENCES public.edd_cases(id) ON DELETE CASCADE,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  responses jsonb,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.edd_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edd_case_id uuid NOT NULL REFERENCES public.edd_cases(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  document_type text NOT NULL,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.edd_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edd_questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edd_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "EDD cases readable by admin compliance" ON public.edd_cases;
CREATE POLICY "EDD cases readable by admin compliance" ON public.edd_cases FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

DROP POLICY IF EXISTS "EDD cases manageable by admin compliance" ON public.edd_cases;
CREATE POLICY "EDD cases manageable by admin compliance" ON public.edd_cases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

DROP POLICY IF EXISTS "EDD questionnaires readable by admin compliance" ON public.edd_questionnaires;
CREATE POLICY "EDD questionnaires readable by admin compliance" ON public.edd_questionnaires FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

DROP POLICY IF EXISTS "EDD documents readable by admin compliance" ON public.edd_documents;
CREATE POLICY "EDD documents readable by admin compliance" ON public.edd_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

-- No seed data: edd_questionnaires requires a valid edd_case_id FK