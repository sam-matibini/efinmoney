-- Diagnostic: TrialBalancePanel.tsx fetches ledger_entries with no .limit()/pagination
-- and aggregates client-side. PostgREST defaults to capping unpaginated selects at
-- 1000 rows. If ledger_entries has more rows than that, the panel silently sees a
-- partial slice and shows wrong totals — independent of whether the ledger itself
-- is actually balanced. Confirm row counts before concluding that's the cause.
DO $$
DECLARE
  v_total bigint;
  v_cad bigint;
  v_ngn bigint;
  v_usd bigint;
BEGIN
  SELECT count(*) INTO v_total FROM public.ledger_entries;
  SELECT count(*) INTO v_cad FROM public.ledger_entries WHERE currency_code = 'CAD';
  SELECT count(*) INTO v_ngn FROM public.ledger_entries WHERE currency_code = 'NGN';
  SELECT count(*) INTO v_usd FROM public.ledger_entries WHERE currency_code = 'USD';
  RAISE NOTICE 'ledger_entries total=%, CAD=%, NGN=%, USD=%', v_total, v_cad, v_ngn, v_usd;
END $$;
