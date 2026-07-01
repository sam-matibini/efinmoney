-- Diagnostic: replicate exactly what TrialBalancePanel.tsx computes (per-account
-- debit/credit totals for a given currency, active accounts only) to compare
-- directly against what the user is seeing on screen right now.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT la.code, la.name, la.currency_code,
           COALESCE(SUM(le.debit_amount), 0) AS debit_total,
           COALESCE(SUM(le.credit_amount), 0) AS credit_total
      FROM public.ledger_accounts la
      LEFT JOIN public.ledger_entries le
        ON le.account_id = la.id AND le.currency_code IN ('CAD', 'NGN', 'USD')
     WHERE la.is_active = true
     GROUP BY la.code, la.name, la.currency_code
    HAVING COALESCE(SUM(le.debit_amount), 0) > 0 OR COALESCE(SUM(le.credit_amount), 0) > 0
     ORDER BY la.code
  LOOP
    RAISE NOTICE '% % : debit=% credit=%', r.code, r.name, r.debit_total, r.credit_total;
  END LOOP;
END $$;
