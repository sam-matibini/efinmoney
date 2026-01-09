-- Drop and recreate the function with is_default in return type
DROP FUNCTION IF EXISTS public.get_user_wallet_balances(uuid);

CREATE OR REPLACE FUNCTION public.get_user_wallet_balances(p_user_id uuid)
RETURNS TABLE(
    wallet_id uuid, 
    currency_code character varying, 
    currency_name character varying, 
    symbol character varying, 
    flag_emoji character varying, 
    balance numeric, 
    status wallet_status,
    is_default boolean
)
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
        w.status,
        w.is_default
    FROM public.wallets w
    JOIN public.currencies c ON w.currency_code = c.code
    WHERE w.user_id = p_user_id
    ORDER BY w.is_default DESC, c.name;
END;
$function$;