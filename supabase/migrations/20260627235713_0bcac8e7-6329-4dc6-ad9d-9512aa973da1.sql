
DO $$
DECLARE r RECORD; v_jid uuid; v_acct uuid; v_diff numeric;
BEGIN
  FOR r IN
    SELECT currency_code,
           ROUND((SUM(debit_amount)-SUM(credit_amount))::numeric, 2) AS diff
    FROM public.ledger_entries
    WHERE currency_code IS NOT NULL
    GROUP BY currency_code
    HAVING ABS(SUM(debit_amount)-SUM(credit_amount)) > 0.005
  LOOP
    v_jid := gen_random_uuid();
    v_acct := public.ensure_fx_clearing_account(r.currency_code);
    v_diff := r.diff;
    INSERT INTO public.ledger_entries
      (journal_id, account_id, currency_code, debit_amount, credit_amount,
       description, reference_type)
    VALUES
      (v_jid, v_acct, r.currency_code,
       CASE WHEN v_diff < 0 THEN ABS(v_diff) ELSE 0 END,
       CASE WHEN v_diff > 0 THEN v_diff ELSE 0 END,
       'Residual rounding sweep to balance TB',
       'tb_sweep');
  END LOOP;
END $$;
