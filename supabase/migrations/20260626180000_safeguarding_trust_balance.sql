-- Batch 4 — RPAA safeguarding live: record real trust-account balances.
-- compute_safeguarding_snapshot() already reads the latest bank_transactions.balance
-- for trust-type bank accounts; until a balance is recorded, bank_trust_balance is
-- null and the three-way check can't assert real coverage. This RPC lets finance
-- post the latest trust-account statement balance and immediately recomputes today's
-- snapshot, making safeguarding live rather than modelled.

CREATE OR REPLACE FUNCTION public.record_trust_balance(
  p_bank_account_id uuid,
  p_balance numeric,
  p_as_of date DEFAULT CURRENT_DATE
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_trust boolean;
BEGIN
  IF v_caller IS NULL
     OR NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'finance')) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT (account_type = 'trust' AND is_active)
  INTO v_is_trust
  FROM public.bank_accounts
  WHERE id = p_bank_account_id;

  IF v_is_trust IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'bank account is not an active trust account';
  END IF;

  -- Record the statement balance as a bank_transactions snapshot row.
  INSERT INTO public.bank_transactions
    (bank_account_id, description, transaction_date, balance, is_categorized, is_posted, imported_at)
  VALUES
    (p_bank_account_id, 'Trust balance statement snapshot', p_as_of, p_balance, true, false, now());

  -- Refresh today's three-way snapshot so the new balance is reflected immediately.
  PERFORM public.compute_safeguarding_snapshot(p_as_of);
END;
$$;

REVOKE ALL ON FUNCTION public.record_trust_balance(uuid, numeric, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_trust_balance(uuid, numeric, date) TO authenticated, service_role;
