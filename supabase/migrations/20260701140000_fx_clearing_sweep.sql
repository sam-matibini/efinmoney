-- The 2026-06-27 auto-balancing trigger (enforce_journal_currency_balance) fixed the
-- per-currency trial balance, but FX Clearing - <CCY> accounts have no path to
-- recognized FX Gain/Loss — they just accumulate indefinitely. Recognizing P&L is a
-- finance decision, not something to run silently on a cron (same reasoning as
-- record_trust_balance() being manual, not automatic) — so this adds a manual,
-- role-gated sweep RPC instead of a cron job.
--
-- Mechanics: for each FX Clearing account with a non-trivial balance, post BOTH the
-- zeroing leg and the offsetting Gain/Loss leg (same currency, same journal_id) in a
-- SINGLE insert statement, so the auto-balancing trigger sees each currency already
-- balanced and does not try to "correct" it (a multi-statement version of this would
-- have the trigger fight itself — see the iteration history in the 2026-06-27
-- migrations for why that matters).
CREATE OR REPLACE FUNCTION public.sweep_fx_clearing_to_gain_loss()
RETURNS TABLE(swept_currency varchar, swept_amount numeric, posted_to text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_journal_id uuid := gen_random_uuid();
  v_ref_prefix text := 'fx-sweep-' || to_char(now(), 'YYYYMMDDHH24MISS');
  v_gain_account uuid;
  v_loss_account uuid;
BEGIN
  IF v_caller IS NULL OR NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'finance')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT id INTO v_gain_account FROM public.ledger_accounts WHERE code = '4100';
  SELECT id INTO v_loss_account FROM public.ledger_accounts WHERE code = '5100';
  IF v_gain_account IS NULL OR v_loss_account IS NULL THEN
    RAISE EXCEPTION 'FX Gain (4100) / FX Loss (5100) accounts not found';
  END IF;

  CREATE TEMP TABLE _fx_sweep_clearing ON COMMIT DROP AS
    SELECT la.id AS account_id, la.currency_code AS ccy,
           ROUND((SUM(le.debit_amount) - SUM(le.credit_amount))::numeric, 2) AS balance
      FROM public.ledger_accounts la
      JOIN public.ledger_entries le ON le.account_id = la.id
     WHERE la.name LIKE 'FX Clearing - %'
     GROUP BY la.id, la.currency_code
    HAVING ABS(SUM(le.debit_amount) - SUM(le.credit_amount)) > 0.005;

  IF NOT EXISTS (SELECT 1 FROM _fx_sweep_clearing) THEN
    RETURN;
  END IF;

  INSERT INTO public.ledger_entries
    (journal_id, account_id, currency_code, debit_amount, credit_amount, description, reference_type, external_reference, created_by)
  SELECT v_journal_id, account_id, ccy,
         CASE WHEN balance < 0 THEN ABS(balance) ELSE 0 END,
         CASE WHEN balance > 0 THEN balance ELSE 0 END,
         'FX Clearing sweep — realized', 'fx_clearing_sweep', v_ref_prefix || '-' || ccy || '-clr', v_caller
    FROM _fx_sweep_clearing
  UNION ALL
  SELECT v_journal_id,
         CASE WHEN balance > 0 THEN v_loss_account ELSE v_gain_account END,
         ccy,
         CASE WHEN balance > 0 THEN balance ELSE 0 END,
         CASE WHEN balance < 0 THEN ABS(balance) ELSE 0 END,
         'FX Clearing sweep — realized', 'fx_clearing_sweep', v_ref_prefix || '-' || ccy || '-pl', v_caller
    FROM _fx_sweep_clearing;

  RETURN QUERY
    SELECT ccy, ABS(balance), (CASE WHEN balance > 0 THEN 'FX Loss' ELSE 'FX Gain' END)::text
      FROM _fx_sweep_clearing;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_fx_clearing_to_gain_loss() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_fx_clearing_to_gain_loss() TO authenticated;
