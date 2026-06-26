-- Make Settlement Reconciliation (#18) writable: import, run-matching, manual reconcile, delete.
-- The original migration only created a SELECT policy. Add INSERT/UPDATE/DELETE for admin + finance.

DROP POLICY IF EXISTS "Settlement recs insertable by admin finance" ON public.settlement_reconciliations;
CREATE POLICY "Settlement recs insertable by admin finance" ON public.settlement_reconciliations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

DROP POLICY IF EXISTS "Settlement recs updatable by admin finance" ON public.settlement_reconciliations;
CREATE POLICY "Settlement recs updatable by admin finance" ON public.settlement_reconciliations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

DROP POLICY IF EXISTS "Settlement recs deletable by admin finance" ON public.settlement_reconciliations;
CREATE POLICY "Settlement recs deletable by admin finance" ON public.settlement_reconciliations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

-- Track when a row was last reconciled (matching run / manual edit) for analytics.
ALTER TABLE public.settlement_reconciliations
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
