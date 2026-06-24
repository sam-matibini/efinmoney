-- Remediate the historical trial-balance imbalance.
--
-- Legacy journals (external transfers, cross-currency internal transfers,
-- the fx_swap DB function) posted the debit leg in one currency and the
-- credit leg in another. Within any single currency that leaves a residual
-- debit-minus-credit gap, so the trial balance never nets to zero — even
-- per currency. New transactions are now posted balanced-per-currency, but
-- the accumulated historical gap stays on the books until corrected.
--
-- Fix: for each currency with a residual, post a one-sided correcting entry
-- to a dedicated suspense/translation equity account so that currency's
-- debits equal its credits. Once every currency balances, the grand total
-- (the sum of the per-currency totals) balances as well.

DO $$
DECLARE
  v_suspense_id uuid;
  v_journal uuid := gen_random_uuid();
  r RECORD;
BEGIN
  -- Dedicated account to absorb the legacy per-currency imbalance.
  INSERT INTO public.ledger_accounts (code, name, account_type, is_system, is_active, description)
  VALUES (
    '3950',
    'FX Translation / Opening Balance Suspense',
    'equity', true, true,
    'Absorbs pre-existing per-currency trial-balance imbalances from legacy mixed-currency journals'
  )
  ON CONFLICT (code) DO NOTHING;

  SELECT id INTO v_suspense_id FROM public.ledger_accounts WHERE code = '3950';

  -- One correcting entry per currency. Exclude the suspense account itself so
  -- this migration is safe to reason about even if re-run after a reset.
  FOR r IN
    SELECT currency_code,
           COALESCE(SUM(debit_amount), 0) - COALESCE(SUM(credit_amount), 0) AS diff
    FROM public.ledger_entries
    WHERE account_id <> v_suspense_id
    GROUP BY currency_code
    HAVING ABS(COALESCE(SUM(debit_amount), 0) - COALESCE(SUM(credit_amount), 0)) >= 0.01
  LOOP
    -- diff > 0  -> debits exceed credits -> credit the suspense to balance.
    -- diff < 0  -> credits exceed debits -> debit the suspense to balance.
    INSERT INTO public.ledger_entries
      (journal_id, account_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
    VALUES (
      v_journal,
      v_suspense_id,
      r.currency_code,
      CASE WHEN r.diff < 0 THEN ABS(r.diff) ELSE 0 END,
      CASE WHEN r.diff > 0 THEN r.diff ELSE 0 END,
      'Opening balance / historical FX imbalance correction (' || r.currency_code || ')',
      'opening_balance',
      NULL
    );
  END LOOP;
END $$;
