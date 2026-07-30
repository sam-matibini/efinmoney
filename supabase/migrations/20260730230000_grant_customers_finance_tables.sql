-- Missing GRANTs on the finance/CRM tables created in 20260109051522.
-- RLS was enabled but table-level GRANT was omitted, causing 42501 on all writes.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoices       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoice_items  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_bills       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_bill_items  TO authenticated;
