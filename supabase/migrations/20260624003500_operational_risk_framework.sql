-- Operational Risk Framework (#4) + Case Management (#15) + Unclaimed Funds (#19)
-- Combined migration for efficiency.

-- === OPERATIONAL RISK REGISTER ===
CREATE TABLE IF NOT EXISTS public.operational_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('settlement_failure', 'fraud_event', 'processor_outage', 'cyber_attack', 'kyc_failure', 'regulatory_breach', 'other')),
  likelihood integer NOT NULL DEFAULT 1 CHECK (likelihood BETWEEN 1 AND 5),
  impact integer NOT NULL DEFAULT 1 CHECK (impact BETWEEN 1 AND 5),
  risk_score integer GENERATED ALWAYS AS (likelihood * impact) STORED,
  status text NOT NULL DEFAULT 'identified' CHECK (status IN ('identified', 'mitigating', 'accepted', 'closed')),
  mitigation text,
  owner uuid REFERENCES auth.users(id),
  review_date timestamptz DEFAULT (now() + interval '90 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_risks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_operational_risks_score ON public.operational_risks(risk_score DESC);

DROP POLICY IF EXISTS "Operational risks readable by admin roles" ON public.operational_risks;
CREATE POLICY "Operational risks readable by admin roles"
  ON public.operational_risks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

DROP POLICY IF EXISTS "Operational risks manageable by admin" ON public.operational_risks;
CREATE POLICY "Operational risks manageable by admin" ON public.operational_risks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

-- === CASE MANAGEMENT EXTENSIONS ===
CREATE TABLE IF NOT EXISTS public.case_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.compliance_alerts(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.compliance_alerts(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.case_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.compliance_alerts(id) ON DELETE CASCADE,
  escalated_by uuid REFERENCES auth.users(id),
  escalated_to uuid REFERENCES auth.users(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.case_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_escalations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Case evidence readable by admin roles" ON public.case_evidence;
CREATE POLICY "Case evidence readable by admin roles" ON public.case_evidence FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

DROP POLICY IF EXISTS "Case evidence manageable by admin compliance" ON public.case_evidence;
CREATE POLICY "Case evidence manageable by admin compliance" ON public.case_evidence FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

DROP POLICY IF EXISTS "Case notes readable by admin roles" ON public.case_notes;
CREATE POLICY "Case notes readable by admin roles" ON public.case_notes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

DROP POLICY IF EXISTS "Case notes manageable by admin compliance" ON public.case_notes;
CREATE POLICY "Case notes manageable by admin compliance" ON public.case_notes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

DROP POLICY IF EXISTS "Case escalations readable by admin roles" ON public.case_escalations;
CREATE POLICY "Case escalations readable by admin roles" ON public.case_escalations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

-- === UNCLAIMED FUNDS REGISTER ===
CREATE TABLE IF NOT EXISTS public.unclaimed_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric(20,2) NOT NULL,
  currency_code varchar(10) NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('unknown_deposit', 'unallocated', 'returned_payment', 'failed_settlement')),
  reference text,
  status text NOT NULL DEFAULT 'identified' CHECK (status IN ('identified', 'escalated_1d', 'escalated_3d', 'escalated_7d', 'escalated_30d', 'resolved', 'written_off')),
  days_outstanding integer NOT NULL DEFAULT 0,
  assigned_to uuid REFERENCES auth.users(id),
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.unclaimed_funds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Unclaimed funds readable by admin roles" ON public.unclaimed_funds;
CREATE POLICY "Unclaimed funds readable by admin roles" ON public.unclaimed_funds FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

DROP POLICY IF EXISTS "Unclaimed funds manageable by admin finance" ON public.unclaimed_funds;
CREATE POLICY "Unclaimed funds manageable by admin finance" ON public.unclaimed_funds FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

-- Auto-escalation function for unclaimed funds
CREATE OR REPLACE FUNCTION public.escalate_unclaimed_funds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.unclaimed_funds SET status = 'escalated_1d' WHERE status = 'identified' AND days_outstanding >= 1;
  UPDATE public.unclaimed_funds SET status = 'escalated_3d' WHERE status IN ('identified', 'escalated_1d') AND days_outstanding >= 3;
  UPDATE public.unclaimed_funds SET status = 'escalated_7d' WHERE status IN ('identified', 'escalated_1d', 'escalated_3d') AND days_outstanding >= 7;
  UPDATE public.unclaimed_funds SET status = 'escalated_30d' WHERE status IN ('identified', 'escalated_1d', 'escalated_3d', 'escalated_7d') AND days_outstanding >= 30;
END;
$$;

REVOKE ALL ON FUNCTION public.escalate_unclaimed_funds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.escalate_unclaimed_funds() TO service_role;