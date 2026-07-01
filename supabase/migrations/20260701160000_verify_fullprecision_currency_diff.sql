-- Show the FULL-PRECISION per-currency debit/credit difference (ledger stores
-- DECIMAL(20,8), so crypto/FX legs carry sub-cent digits). This tells us whether
-- the ~1c the Trial Balance shows is genuine sub-cent rounding dust vs a real gap.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT currency_code,
           SUM(debit_amount)  AS d,
           SUM(credit_amount) AS c,
           SUM(debit_amount) - SUM(credit_amount) AS diff_full,
           ROUND((SUM(debit_amount) - SUM(credit_amount))::numeric, 2) AS diff_cents
      FROM public.ledger_entries
     GROUP BY currency_code
    HAVING ABS(SUM(debit_amount) - SUM(credit_amount)) > 0
     ORDER BY currency_code
  LOOP
    RAISE NOTICE '% : diff_full=% diff_rounded2=%', r.currency_code, r.diff_full, r.diff_cents;
  END LOOP;
END $$;
