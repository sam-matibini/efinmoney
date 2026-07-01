
-- 1. FX Clearing accounts per currency
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active) VALUES
  ('1310', 'FX Clearing - CAD',  'asset', 'CAD',  true),
  ('1311', 'FX Clearing - USD',  'asset', 'USD',  true),
  ('1312', 'FX Clearing - NGN',  'asset', 'NGN',  true),
  ('1313', 'FX Clearing - KES',  'asset', 'KES',  true),
  ('1314', 'FX Clearing - UGX',  'asset', 'UGX',  true),
  ('1315', 'FX Clearing - ZMW',  'asset', 'ZMW',  true),
  ('1316', 'FX Clearing - XLM',  'asset', 'XLM',  true),
  ('1317', 'FX Clearing - USDC', 'asset', 'USDC', true)
ON CONFLICT (code) DO NOTHING;

-- 2. Helper to lazily create FX clearing accounts for new currencies
CREATE OR REPLACE FUNCTION public.ensure_fx_clearing_account(p_ccy varchar)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_code text; v_next int;
BEGIN
  SELECT id INTO v_id FROM public.ledger_accounts
    WHERE currency_code = p_ccy AND name = 'FX Clearing - ' || p_ccy LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT COALESCE(MAX((substring(code from '^13(\d+)$'))::int), 9) + 1 INTO v_next
    FROM public.ledger_accounts WHERE code ~ '^13\d+$';
  v_code := '13' || lpad(v_next::text, 2, '0');

  INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active)
  VALUES (v_code, 'FX Clearing - ' || p_ccy, 'asset', p_ccy, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- 3. Backfill historical imbalances
DO $$
DECLARE r RECORD; v_acct uuid; v_diff numeric;
BEGIN
  FOR r IN
    SELECT journal_id, currency_code,
           ROUND((SUM(debit_amount) - SUM(credit_amount))::numeric, 2) AS diff
      FROM public.ledger_entries
     WHERE currency_code IS NOT NULL
     GROUP BY journal_id, currency_code
    HAVING ABS(SUM(debit_amount) - SUM(credit_amount)) > 0.005
  LOOP
    v_acct := public.ensure_fx_clearing_account(r.currency_code);
    v_diff := r.diff;
    INSERT INTO public.ledger_entries
      (journal_id, account_id, wallet_id, currency_code,
       debit_amount, credit_amount, description, reference_type, external_reference)
    VALUES
      (r.journal_id, v_acct, NULL, r.currency_code,
       CASE WHEN v_diff < 0 THEN ABS(v_diff) ELSE 0 END,
       CASE WHEN v_diff > 0 THEN v_diff ELSE 0 END,
       'FX Clearing backfill — cross-currency leg',
       'fx_clearing_backfill',
       r.journal_id::text);
  END LOOP;
END $$;

-- 4. Statement-level guardrail (rejects unbalanced single-statement writes)
CREATE OR REPLACE FUNCTION public.enforce_journal_currency_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bad RECORD;
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
    RAISE EXCEPTION
      'Unbalanced journal % in currency %: debits-credits = %',
      bad.journal_id, bad.currency_code, bad.diff
      USING ERRCODE = 'check_violation';
  END LOOP;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_ledger_balance_ins ON public.ledger_entries;
CREATE TRIGGER trg_ledger_balance_ins
AFTER INSERT ON public.ledger_entries
REFERENCING NEW TABLE AS affected
FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_journal_currency_balance();

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
