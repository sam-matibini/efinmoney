
-- Fix 1: Prevent client read of Plaid access_token via column-level privilege.
REVOKE SELECT ON public.plaid_items FROM anon, authenticated;
GRANT SELECT (id, user_id, item_id, institution_id, institution_name, created_at, updated_at)
  ON public.plaid_items TO authenticated;

-- Fix 2: Remove overly-permissive ledger_entries insert policy.
DROP POLICY IF EXISTS "Authenticated users can insert ledger entries" ON public.ledger_entries;
