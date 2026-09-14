-- Fix CAD→USDC (and other) wallet transfers:
--   null value in column "account_id" of relation "ledger_entries"
--
-- Root cause: USDC/USDT lacked Customer Wallet Liability (21xx) accounts, so
-- execute_fx_swap inserted NULL account_id. Apply on project dkdnwumllibwdlqbjkwy.

CREATE OR REPLACE FUNCTION public.ensure_customer_wallet_liability(p_ccy character varying)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_code text;
  v_next int;
  v_ccy varchar(10) := upper(btrim(p_ccy));
BEGIN
  IF v_ccy IS NULL OR v_ccy = '' THEN
    RAISE EXCEPTION 'Currency is required';
  END IF;

  SELECT id INTO v_id
  FROM public.ledger_accounts
  WHERE currency_code = v_ccy
    AND is_active = true
    AND (
      name ILIKE 'Customer Wallet Liability%'
      OR (code LIKE '21%' AND name ILIKE '%Customer Wallet%')
    )
  ORDER BY CASE WHEN name ILIKE 'Customer Wallet Liability%' THEN 0 ELSE 1 END, code
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT id INTO v_id
  FROM public.ledger_accounts
  WHERE currency_code = v_ccy
    AND is_active = true
    AND code LIKE '21%'
  ORDER BY code
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT COALESCE(MAX((substring(code from '^21(\d+)$'))::int), 16) + 1
    INTO v_next
    FROM public.ledger_accounts
   WHERE code ~ '^21\d+$';
  v_code := '21' || lpad(v_next::text, 2, '0');

  INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
  VALUES (v_code, 'Customer Wallet Liability - ' || v_ccy, 'liability', v_ccy, true, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_customer_wallet_liability(character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_customer_wallet_liability(character varying) TO service_role;

INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
SELECT v.code, v.name, 'liability'::public.account_type, v.currency, true, true
FROM (VALUES
  ('2117', 'Customer Wallet Liability - USDC', 'USDC'),
  ('2118', 'Customer Wallet Liability - USDT', 'USDT')
) AS v(code, name, currency)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ledger_accounts la
  WHERE la.code = v.code
     OR (la.currency_code = v.currency AND la.name ILIKE 'Customer Wallet Liability%')
);

-- Ensure FX clearing exists for USDC (cross-currency journal auto-balance).
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active)
SELECT '1317', 'FX Clearing - USDC', 'asset'::public.account_type, 'USDC', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.ledger_accounts
  WHERE code = '1317' OR (currency_code = 'USDC' AND name ILIKE 'FX Clearing%')
);

CREATE OR REPLACE FUNCTION public.execute_fx_swap(
    p_user_id uuid,
    p_from_wallet_id uuid,
    p_to_wallet_id uuid,
    p_from_amount numeric,
    p_effective_rate numeric,
    p_fee_amount numeric DEFAULT 0
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_journal_id UUID := gen_random_uuid();
    v_from_currency VARCHAR(10);
    v_to_currency VARCHAR(10);
    v_to_amount DECIMAL;
    v_from_liability_account UUID;
    v_to_liability_account UUID;
    v_fee_income_account UUID;
    v_from_wallet_owner UUID;
    v_to_wallet_owner UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized: Cannot execute swap for another user';
    END IF;

    SELECT user_id INTO v_from_wallet_owner FROM wallets WHERE id = p_from_wallet_id;
    SELECT user_id INTO v_to_wallet_owner FROM wallets WHERE id = p_to_wallet_id;

    IF v_from_wallet_owner IS NULL OR v_to_wallet_owner IS NULL THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;

    IF v_from_wallet_owner != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Source wallet does not belong to you';
    END IF;

    IF v_to_wallet_owner != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Destination wallet does not belong to you';
    END IF;

    SELECT currency_code INTO v_from_currency FROM wallets WHERE id = p_from_wallet_id;
    SELECT currency_code INTO v_to_currency FROM wallets WHERE id = p_to_wallet_id;

    IF public.get_wallet_balance(p_from_wallet_id) < p_from_amount THEN
        RAISE EXCEPTION 'Insufficient wallet balance';
    END IF;

    v_to_amount := (p_from_amount - p_fee_amount) * p_effective_rate;

    v_from_liability_account := public.ensure_customer_wallet_liability(v_from_currency);
    v_to_liability_account := public.ensure_customer_wallet_liability(v_to_currency);
    SELECT id INTO v_fee_income_account FROM ledger_accounts WHERE code = '4200' LIMIT 1;
    IF v_fee_income_account IS NULL THEN
        SELECT id INTO v_fee_income_account FROM ledger_accounts WHERE code = '4100' LIMIT 1;
    END IF;

    IF v_from_liability_account IS NULL THEN
        RAISE EXCEPTION 'Ledger account not found for %', v_from_currency;
    END IF;
    IF v_to_liability_account IS NULL THEN
        RAISE EXCEPTION 'Ledger account not found for %', v_to_currency;
    END IF;
    IF p_fee_amount > 0 AND v_fee_income_account IS NULL THEN
        RAISE EXCEPTION 'Ledger account not found for transfer fee revenue';
    END IF;

    INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
    VALUES (v_journal_id, v_from_liability_account, p_from_wallet_id, v_from_currency, p_from_amount, 0, 'FX Swap - Debit', 'fx', p_user_id);

    INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
    VALUES (v_journal_id, v_to_liability_account, p_to_wallet_id, v_to_currency, 0, v_to_amount, 'FX Swap - Credit', 'fx', p_user_id);

    IF p_fee_amount > 0 THEN
        INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
        VALUES (v_journal_id, v_fee_income_account, NULL, v_from_currency, 0, p_fee_amount, 'Transfer fee — cost-recovery rate card', 'fx', p_user_id);
    END IF;

    RETURN v_journal_id;
END;
$function$;

-- Sanity check (should return two UUIDs, not null)
SELECT
  public.ensure_customer_wallet_liability('CAD') AS cad_liability,
  public.ensure_customer_wallet_liability('USDC') AS usdc_liability;
