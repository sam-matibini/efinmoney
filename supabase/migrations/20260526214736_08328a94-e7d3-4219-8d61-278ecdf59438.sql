
-- 1) Lock down direct ledger writes from clients
DROP POLICY IF EXISTS "Authenticated ledger inserts" ON public.ledger_entries;

CREATE POLICY "Staff ledger inserts only"
ON public.ledger_entries
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'finance'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 2) Remove unrestricted client UPDATE on transfers
DROP POLICY IF EXISTS "Users can update own transfers" ON public.transfers;

-- 3) Fix broken member-visibility predicate on business_card_programs
DROP POLICY IF EXISTS "biz_program owner read" ON public.business_card_programs;

CREATE POLICY "biz_program owner read"
ON public.business_card_programs
FOR SELECT
TO authenticated
USING (
  auth.uid() = owner_user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1
      FROM public.business_card_members m
     WHERE m.program_id = business_card_programs.id
       AND m.user_id = auth.uid()
  )
);
