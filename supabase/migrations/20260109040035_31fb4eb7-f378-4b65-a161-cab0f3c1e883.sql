-- Fix the overly permissive ledger_entries INSERT policy
-- Drop the existing permissive policy
DROP POLICY IF EXISTS "System can insert ledger entries" ON public.ledger_entries;

-- Create a restrictive policy that only allows:
-- 1. Finance/Admin roles for administrative entries
-- 2. Wallet owners for entries affecting their own wallets
-- Note: SECURITY DEFINER functions (like execute_fx_swap) bypass RLS entirely, so they can still insert
CREATE POLICY "Authenticated ledger inserts" ON public.ledger_entries
    FOR INSERT WITH CHECK (
        -- Allow finance or admin roles for any entry
        public.has_role(auth.uid(), 'finance') 
        OR public.has_role(auth.uid(), 'admin')
        -- Allow users to insert entries for their own wallets
        OR (
            wallet_id IS NOT NULL 
            AND wallet_id IN (
                SELECT id FROM public.wallets WHERE user_id = auth.uid()
            )
        )
        -- Allow system entries (no wallet reference) only from elevated roles
        OR (
            wallet_id IS NULL 
            AND (
                public.has_role(auth.uid(), 'finance') 
                OR public.has_role(auth.uid(), 'admin')
            )
        )
    );