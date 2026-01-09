-- Fix SECURITY DEFINER functions to include authorization checks

-- First, drop and recreate get_wallet_balance with authorization
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_wallet_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    balance DECIMAL(20, 8);
    v_owner_id UUID;
BEGIN
    -- SECURITY CHECK: Verify wallet exists and get owner
    SELECT user_id INTO v_owner_id FROM public.wallets WHERE id = p_wallet_id;
    
    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;
    
    -- SECURITY CHECK: Verify caller is owner or has admin/finance role
    IF auth.uid() IS NOT NULL THEN
        IF v_owner_id != auth.uid() 
           AND NOT public.has_role(auth.uid(), 'admin') 
           AND NOT public.has_role(auth.uid(), 'finance') THEN
            RAISE EXCEPTION 'Unauthorized: Cannot view balance for this wallet';
        END IF;
    END IF;
    
    SELECT COALESCE(SUM(credit_amount) - SUM(debit_amount), 0)
    INTO balance
    FROM public.ledger_entries
    WHERE wallet_id = p_wallet_id;
    
    RETURN balance;
END;
$function$;

-- Drop and recreate get_user_wallet_balances with proper return type and authorization
DROP FUNCTION IF EXISTS public.get_user_wallet_balances(uuid);

CREATE FUNCTION public.get_user_wallet_balances(p_user_id uuid)
 RETURNS TABLE(wallet_id uuid, currency_code character varying, currency_name character varying, symbol character varying, flag_emoji character varying, balance numeric, status wallet_status)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- SECURITY CHECK: Verify caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
    -- SECURITY CHECK: Users can only view their own wallets, admins/finance can view all
    IF p_user_id != auth.uid() 
       AND NOT public.has_role(auth.uid(), 'admin') 
       AND NOT public.has_role(auth.uid(), 'finance') THEN
        RAISE EXCEPTION 'Unauthorized: Cannot view wallets for this user';
    END IF;
    
    RETURN QUERY
    SELECT 
        w.id as wallet_id,
        w.currency_code,
        c.name as currency_name,
        c.symbol,
        c.flag_emoji,
        public.get_wallet_balance(w.id) as balance,
        w.status
    FROM public.wallets w
    JOIN public.currencies c ON w.currency_code = c.code
    WHERE w.user_id = p_user_id
    ORDER BY w.is_default DESC, c.name;
END;
$function$;