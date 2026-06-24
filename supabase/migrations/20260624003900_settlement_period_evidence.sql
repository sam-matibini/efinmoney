-- Settlement Reconciliation (#18) + Period-End Controls (#23) + Evidence Repository (#26)

-- === THREE-WAY SETTLEMENT RECONCILIATION ===
CREATE TABLE IF NOT EXISTS public.settlement_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processor text NOT NULL CHECK (processor IN ('stripe', 'paysafe', 'adyen', 'flutterwave', 'mtn_momo', 'airtel', 'other')),
  processor_settlement_amount numeric(20,2) NOT NULL,
  efinmoney_ledger_amount numeric(20,2) NOT NULL,
  bank_statement_amount numeric(20,2),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('matched', 'variance', 'missing', 'duplicate', 'pending')),
  variance_amount numeric(20,2) GENERATED ALWAYS AS (ABS(processor_settlement_amount - efinmoney_ledger_amount)) STORED,
  batch_ref text,
  settlement_date date,
  reconciled_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.settlement_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Settlement recs readable by admin finance" ON public.settlement_reconciliations;
CREATE POLICY "Settlement recs readable by admin finance" ON public.settlement_reconciliations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

-- === PERIOD-END CONTROLS ===
CREATE TABLE IF NOT EXISTS public.period_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'review_pending', 'controller_review', 'approved', 'locked')),
  locked_by uuid REFERENCES auth.users(id),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_start, period_end)
);

CREATE TABLE IF NOT EXISTS public.period_close_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_lock_id uuid NOT NULL REFERENCES public.period_locks(id) ON DELETE CASCADE,
  task text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_by uuid REFERENCES auth.users(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- No seed data: period_close_checklists requires a valid period_lock_id FK

ALTER TABLE public.period_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_close_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Period locks readable by admin finance" ON public.period_locks;
CREATE POLICY "Period locks readable by admin finance" ON public.period_locks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

DROP POLICY IF EXISTS "Period locks manageable by admin" ON public.period_locks;
CREATE POLICY "Period locks manageable by admin" ON public.period_locks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

DROP POLICY IF EXISTS "Checklists readable by admin finance" ON public.period_close_checklists;
CREATE POLICY "Checklists readable by admin finance" ON public.period_close_checklists FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

-- === EVIDENCE REPOSITORY (7-year retention) ===
CREATE TABLE IF NOT EXISTS public.evidence_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('kyc', 'aml_investigation', 'str_filing', 'reconciliation', 'bank_statement', 'board_approval', 'audit', 'other')),
  reference_id uuid,
  file_path text NOT NULL,
  file_name text NOT NULL,
  retention_until timestamptz NOT NULL DEFAULT (now() + interval '7 years'),
  uploaded_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evidence_retention ON public.evidence_records(retention_until);

ALTER TABLE public.evidence_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Evidence readable by admin roles" ON public.evidence_records;
CREATE POLICY "Evidence readable by admin roles" ON public.evidence_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

DROP POLICY IF EXISTS "Evidence manageable by admin" ON public.evidence_records;
CREATE POLICY "Evidence manageable by admin" ON public.evidence_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'compliance'::app_role));

-- View: items with retention expiring in next 60 days
CREATE OR REPLACE VIEW public.retention_expiry_view AS
SELECT *, retention_until - now() AS days_remaining
FROM public.evidence_records
WHERE retention_until < now() + interval '60 days'
ORDER BY retention_until ASC;