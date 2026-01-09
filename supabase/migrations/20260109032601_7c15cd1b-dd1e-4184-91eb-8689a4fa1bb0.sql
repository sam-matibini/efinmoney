-- Fix security warnings: Add search_path to functions and tighten RLS policies

-- Fix function search_path warnings
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Drop overly permissive INSERT policies and create proper ones
DROP POLICY IF EXISTS "System can insert ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

-- Ledger entries should only be inserted by authenticated users or system functions
CREATE POLICY "Authenticated users can insert ledger entries" ON public.ledger_entries
    FOR INSERT TO authenticated WITH CHECK (
        created_by = auth.uid() 
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'finance')
    );

-- Audit logs can be inserted by any authenticated user (for their own actions) or service role
CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (
        user_id = auth.uid() 
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'compliance')
    );