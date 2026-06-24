-- Compliance Register (#1) + Compliance Calendar (#2)
-- Dynamic compliance obligation tracking with automated calendar/due dates.

CREATE TABLE IF NOT EXISTS public.compliance_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement text NOT NULL,
  regulator text NOT NULL CHECK (regulator IN ('Bank_of_Canada', 'FINTRAC', 'OSFI', 'PIPEDA', 'PCI_DSS', 'Internal')),
  frequency text NOT NULL CHECK (frequency IN ('ongoing', 'daily', 'weekly', 'monthly', 'quarterly', 'annually', 'biennial')),
  last_reviewed timestamptz,
  next_due timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'overdue', 'completed', 'exempt')),
  owner uuid REFERENCES auth.users(id),
  evidence_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the compliance register from the roadmap items
INSERT INTO public.compliance_obligations (requirement, regulator, frequency) VALUES
  ('RPAA Compliance', 'Bank_of_Canada', 'ongoing'),
  ('FINTRAC Compliance', 'FINTRAC', 'ongoing'),
  ('AML Program Review', 'FINTRAC', 'biennial'),
  ('Sanctions Compliance', 'OSFI', 'daily'),
  ('Privacy Compliance', 'PIPEDA', 'ongoing'),
  ('Cybersecurity Compliance', 'Internal', 'quarterly'),
  ('Independent AML Effectiveness Review', 'FINTRAC', 'biennial'),
  ('Trust Account Review', 'Internal', 'monthly'),
  ('RPAA Submissions', 'Bank_of_Canada', 'annually'),
  ('FINTRAC Filings (STR/TPR/LCTR/LVCTR/EFTR)', 'FINTRAC', 'ongoing'),
  ('AML Training', 'FINTRAC', 'annually'),
  ('Board Approval of AML Program', 'Internal', 'annually'),
  ('Enterprise Risk Assessment', 'Internal', 'annually'),
  ('Penetration Testing', 'PCI_DSS', 'annually')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_compliance_obligations_next_due ON public.compliance_obligations(next_due);
CREATE INDEX IF NOT EXISTS idx_compliance_obligations_status ON public.compliance_obligations(status);

ALTER TABLE public.compliance_obligations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Compliance obligations readable by admin roles" ON public.compliance_obligations;
CREATE POLICY "Compliance obligations readable by admin roles"
  ON public.compliance_obligations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

DROP POLICY IF EXISTS "Compliance obligations manageable by admin compliance" ON public.compliance_obligations;
CREATE POLICY "Compliance obligations manageable by admin compliance"
  ON public.compliance_obligations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

-- View: upcoming compliance calendar (next 90 days)
CREATE OR REPLACE VIEW public.compliance_calendar_view AS
SELECT id, requirement, regulator, frequency, next_due, status, 
       CASE WHEN next_due < now() THEN 'overdue' WHEN next_due < now() + interval '7 days' THEN 'due_soon' ELSE 'upcoming' END AS urgency
FROM public.compliance_obligations
WHERE next_due IS NOT NULL AND next_due < now() + interval '90 days'
ORDER BY next_due ASC;