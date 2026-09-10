-- Fail FX swaps with a clear error when a currency has no customer-liability
-- ledger account, instead of inserting NULL account_id (FK / NOT NULL 500).
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
    v_fx_revenue_account UUID;
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

    v_to_amount := (p_from_amount - p_fee_amount) * p_effective_rate;

    -- Prefer customer-wallet liability (21xx) over other 21* payables (e.g. MoMo).
    SELECT id INTO v_from_liability_account
    FROM ledger_accounts
    WHERE currency_code = v_from_currency
      AND is_active = true
      AND code LIKE '21%'
    ORDER BY
      CASE WHEN name ILIKE '%Customer Wallet%' THEN 0 ELSE 1 END,
      code
    LIMIT 1;

    SELECT id INTO v_to_liability_account
    FROM ledger_accounts
    WHERE currency_code = v_to_currency
      AND is_active = true
      AND code LIKE '21%'
    ORDER BY
      CASE WHEN name ILIKE '%Customer Wallet%' THEN 0 ELSE 1 END,
      code
    LIMIT 1;

    SELECT id INTO v_fx_revenue_account FROM ledger_accounts WHERE code = '4100';

    IF v_from_liability_account IS NULL THEN
        RAISE EXCEPTION 'Ledger account not found for %', v_from_currency;
    END IF;
    IF v_to_liability_account IS NULL THEN
        RAISE EXCEPTION 'Ledger account not found for %', v_to_currency;
    END IF;
    IF p_fee_amount > 0 AND v_fx_revenue_account IS NULL THEN
        RAISE EXCEPTION 'Ledger account not found for FX fee revenue';
    END IF;

    INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
    VALUES (v_journal_id, v_from_liability_account, p_from_wallet_id, v_from_currency, p_from_amount, 0, 'FX Swap - Debit', 'fx', p_user_id);

    INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
    VALUES (v_journal_id, v_to_liability_account, p_to_wallet_id, v_to_currency, 0, v_to_amount, 'FX Swap - Credit', 'fx', p_user_id);

    IF p_fee_amount > 0 THEN
        INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
        VALUES (v_journal_id, v_fx_revenue_account, NULL, v_from_currency, 0, p_fee_amount, 'FX Fee Revenue', 'fx', p_user_id);
    END IF;

    RETURN v_journal_id;
END;
$function$;
