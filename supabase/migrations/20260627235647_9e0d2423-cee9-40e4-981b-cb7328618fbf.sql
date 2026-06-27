
CREATE OR REPLACE FUNCTION public.enforce_journal_currency_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Only run on the outermost (user) statement; do not recurse into the
  -- corrective INSERT this function emits.
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  WITH touched AS (
    SELECT DISTINCT journal_id FROM affected
  ),
  bad AS (
    SELECT le.journal_id, le.currency_code,
           ROUND((SUM(le.debit_amount) - SUM(le.credit_amount))::numeric, 2) AS diff
      FROM public.ledger_entries le
      JOIN touched t ON t.journal_id = le.journal_id
     WHERE le.currency_code IS NOT NULL
     GROUP BY le.journal_id, le.currency_code
    HAVING ABS(SUM(le.debit_amount) - SUM(le.credit_amount)) > 0.005
  )
  INSERT INTO public.ledger_entries
    (journal_id, account_id, wallet_id, currency_code,
     debit_amount, credit_amount, description, reference_type, external_reference)
  SELECT bad.journal_id,
         public.ensure_fx_clearing_account(bad.currency_code),
         NULL,
         bad.currency_code,
         CASE WHEN bad.diff < 0 THEN ABS(bad.diff) ELSE 0 END,
         CASE WHEN bad.diff > 0 THEN bad.diff ELSE 0 END,
         'FX Clearing — auto-balancing cross-currency leg',
         'fx_clearing_auto',
         NULL
    FROM bad;
  RETURN NULL;
END $$;
