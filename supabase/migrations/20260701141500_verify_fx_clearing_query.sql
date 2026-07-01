-- One-time diagnostic: confirm the FX Clearing balance computation used by
-- sweep_fx_clearing_to_gain_loss() returns sane values before the UI exposes it.
-- Read-only — no ledger_entries writes.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT la.code, la.currency_code AS ccy,
           ROUND((SUM(le.debit_amount) - SUM(le.credit_amount))::numeric, 2) AS balance
      FROM public.ledger_accounts la
      JOIN public.ledger_entries le ON le.account_id = la.id
     WHERE la.name LIKE 'FX Clearing - %'
     GROUP BY la.code, la.currency_code
     ORDER BY la.code
  LOOP
    RAISE NOTICE '% (%) balance=% -> would post to %',
      r.code, r.ccy, r.balance,
      CASE WHEN ABS(r.balance) <= 0.005 THEN 'nothing (below threshold)'
           WHEN r.balance > 0 THEN 'FX Loss'
           ELSE 'FX Gain' END;
  END LOOP;
END $$;
