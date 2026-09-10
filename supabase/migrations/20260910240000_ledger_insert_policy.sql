-- GRANT INSERT + scoped INSERT policy for the `authenticated` JWT role.
-- Production previously only had "Staff ledger inserts only", so consumer
-- CAD→USDC posts failed: new row violates row-level security policy for table
-- "ledger_entries". Do not use WITH CHECK (true) here.

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;

DROP POLICY IF EXISTS "ledger_insert_policy" ON public.ledger_entries;
DROP POLICY IF EXISTS "Users insert own wallet ledger entries" ON public.ledger_entries;

CREATE POLICY ledger_insert_policy
ON public.ledger_entries
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND created_by = auth.uid()
  AND wallet_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.wallets w
    WHERE w.id = wallet_id
      AND w.user_id = auth.uid()
  )
);
