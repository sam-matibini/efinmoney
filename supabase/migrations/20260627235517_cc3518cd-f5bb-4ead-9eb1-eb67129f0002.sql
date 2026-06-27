
-- Replace the reject-on-imbalance trigger with an auto-balancing one.
CREATE OR REPLACE FUNCTION public.enforce_journal_currency_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  bad RECORD;
  v_acct uuid;
  v_diff numeric;
BEGIN
  FOR bad IN
    SELECT le.journal_id, le.currency_code,
           ROUND((SUM(le.debit_amount) - SUM(le.credit_amount))::numeric, 2) AS diff
      FROM public.ledger_entries le
      JOIN (SELECT DISTINCT journal_id FROM affected) j ON j.journal_id = le.journal_id
     WHERE le.currency_code IS NOT NULL
     GROUP BY le.journal_id, le.currency_code
    HAVING ABS(SUM(le.debit_amount) - SUM(le.credit_amount)) > 0.005
  LOOP
    v_acct := public.ensure_fx_clearing_account(bad.currency_code);
    v_diff := bad.diff;
    INSERT INTO public.ledger_entries
      (journal_id, account_id, wallet_id, currency_code,
       debit_amount, credit_amount, description, reference_type, external_reference)
    VALUES
      (bad.journal_id, v_acct, NULL, bad.currency_code,
       CASE WHEN v_diff < 0 THEN ABS(v_diff) ELSE 0 END,
       CASE WHEN v_diff > 0 THEN v_diff ELSE 0 END,
       'FX Clearing — auto-balancing cross-currency leg',
       'fx_clearing_auto',
       bad.journal_id::text);
  END LOOP;
  RETURN NULL;
END $$;

-- The UPDATE / DELETE triggers keep the same body via this single function.
DROP TRIGGER IF EXISTS trg_ledger_balance_upd ON public.ledger_entries;
CREATE TRIGGER trg_ledger_balance_upd
AFTER UPDATE ON public.ledger_entries
REFERENCING NEW TABLE AS affected
FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_journal_currency_balance();

DROP TRIGGER IF EXISTS trg_ledger_balance_del ON public.ledger_entries;
CREATE TRIGGER trg_ledger_balance_del
AFTER DELETE ON public.ledger_entries
REFERENCING OLD TABLE AS affected
FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_journal_currency_balance();
