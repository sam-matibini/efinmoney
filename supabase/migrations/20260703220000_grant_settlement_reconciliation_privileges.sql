-- Settlement Reconciliation imports failed with:
--   "permission denied for table settlement_reconciliations (42501)"
-- The table has RLS enabled with SELECT/INSERT/UPDATE/DELETE policies, but the
-- coarse table-level GRANTs for the `authenticated` role were never issued, so
-- reads worked (SELECT was effectively available) while every write was denied
-- at the privilege layer before RLS was ever evaluated.
--
-- Grant the table privileges that the existing RLS policies gate. RLS still
-- restricts rows to admin/finance, so this does not widen actual access.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.settlement_reconciliations TO authenticated;
