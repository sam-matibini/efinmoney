-- One-time diagnostic: confirm the FX-Clearing auto-balancing trigger
-- (20260627235438 onward) actually leaves every currency balanced after
-- being applied. No schema changes; output only via RAISE NOTICE.
DO $$
DECLARE
  r RECORD;
  v_any_bad boolean := false;
BEGIN
  FOR r IN
    SELECT currency_code,
           ROUND(SUM(debit_amount)::numeric, 2) AS total_debit,
           ROUND(SUM(credit_amount)::numeric, 2) AS total_credit,
           ROUND((SUM(debit_amount) - SUM(credit_amount))::numeric, 2) AS diff
      FROM public.ledger_entries
     WHERE currency_code IS NOT NULL
     GROUP BY currency_code
     ORDER BY currency_code
  LOOP
    IF ABS(r.diff) > 0.005 THEN
      v_any_bad := true;
      RAISE NOTICE 'UNBALANCED % : debit=% credit=% diff=%', r.currency_code, r.total_debit, r.total_credit, r.diff;
    ELSE
      RAISE NOTICE 'balanced % : debit=% credit=%', r.currency_code, r.total_debit, r.total_credit;
    END IF;
  END LOOP;

  IF NOT v_any_bad THEN
    RAISE NOTICE 'ALL CURRENCIES BALANCED';
  END IF;
END $$;
