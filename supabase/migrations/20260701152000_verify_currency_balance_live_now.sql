DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT currency_code,
           ROUND(SUM(debit_amount)::numeric, 2) AS total_debit,
           ROUND(SUM(credit_amount)::numeric, 2) AS total_credit,
           ROUND((SUM(debit_amount) - SUM(credit_amount))::numeric, 2) AS diff
      FROM public.ledger_entries
     WHERE currency_code IN ('CAD', 'NGN', 'USD')
     GROUP BY currency_code
     ORDER BY currency_code
  LOOP
    RAISE NOTICE '% : debit=% credit=% diff=%', r.currency_code, r.total_debit, r.total_credit, r.diff;
  END LOOP;
END $$;
