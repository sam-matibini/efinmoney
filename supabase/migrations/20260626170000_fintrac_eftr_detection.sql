-- Batch 3 — FINTRAC reporting: automated EFTR detection.
-- Electronic Funds Transfer Reports are due for international EFTs ≥ $10,000 CAD.
-- This sweeps transfers, converts to CAD via the latest fx_rates, and drafts
-- eftr_reports rows. Linked back to the originating transfer for traceability and
-- idempotency. Role-checked RPC + daily pg_cron. (LCTR stays manual — the platform
-- is cashless — and STR is fed from the transaction-monitoring escalation flow.)

-- Traceability + dedup: one EFTR per source transfer.
ALTER TABLE public.eftr_reports
  ADD COLUMN IF NOT EXISTS source_transfer_id uuid REFERENCES public.transfers(id);

CREATE UNIQUE INDEX IF NOT EXISTS eftr_reports_source_transfer
  ON public.eftr_reports (source_transfer_id) WHERE source_transfer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.detect_eftr_candidates()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_new int := 0;
BEGIN
  IF v_caller IS NOT NULL
     AND NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'compliance')
              OR public.has_role(v_caller, 'finance')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.eftr_reports
    (customer_id, report_date, exchange_amount, from_currency, to_currency,
     exchange_rate, equivalent_cad, status, notes, source_transfer_id)
  SELECT p.id, t.created_at::date, t.source_amount, t.source_currency, t.target_currency,
         fx.effective_rate, round(eq.equiv, 2), 'pending',
         'Auto-detected EFTR candidate from transfer ' || t.id, t.id
  FROM public.transfers t
  JOIN public.profiles p ON p.user_id = t.sender_id
  LEFT JOIN LATERAL (
    SELECT effective_rate
    FROM public.fx_rates
    WHERE from_currency = t.source_currency AND to_currency = 'CAD'
    ORDER BY valid_from DESC
    LIMIT 1
  ) fx ON true
  CROSS JOIN LATERAL (
    SELECT CASE
             WHEN t.source_currency = 'CAD' THEN t.source_amount
             WHEN fx.effective_rate IS NOT NULL THEN t.source_amount * fx.effective_rate
             ELSE NULL
           END AS equiv
  ) eq
  WHERE eq.equiv >= 10000
    AND NOT EXISTS (
      SELECT 1 FROM public.eftr_reports e WHERE e.source_transfer_id = t.id);
  GET DIAGNOSTICS v_new = ROW_COUNT;

  IF v_new > 0 THEN
    INSERT INTO public.admin_notifications (admin_id, type, payload)
    SELECT DISTINCT ur.user_id, 'eftr_candidate',
           jsonb_build_object('new', v_new,
             'message', v_new || ' new EFTR candidate(s) ≥ $10k CAD detected and awaiting filing.')
    FROM public.user_roles ur
    WHERE ur.role IN ('admin', 'compliance', 'finance');
  END IF;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_eftr_candidates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_eftr_candidates() TO authenticated, service_role;

-- Daily at 04:00 UTC. Resolve pg_cron schema dynamically; skip if absent.
DO $$
DECLARE v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'schedule' AND n.nspname IN ('cron', 'extensions')
  LIMIT 1;

  IF v_schema IS NULL THEN
    RAISE NOTICE 'pg_cron not found; run public.detect_eftr_candidates() on your own schedule';
    RETURN;
  END IF;

  BEGIN EXECUTE format('SELECT %I.unschedule(%L)', v_schema, 'eftr-detect-daily');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  EXECUTE format('SELECT %I.schedule(%L, %L, %L)',
    v_schema, 'eftr-detect-daily', '0 4 * * *',
    'SELECT public.detect_eftr_candidates();');
END $$;
