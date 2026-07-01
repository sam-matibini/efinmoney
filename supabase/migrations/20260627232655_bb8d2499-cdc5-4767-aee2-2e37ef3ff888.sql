
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.po_status AS ENUM ('draft','pending_approval','approved','sent','partially_received','received','closed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.vendor_bill_payment_status AS ENUM ('unpaid','partial','paid','void');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.vendor_bill_payment_method AS ENUM ('wallet','eft','interac','cpn','pawapay','link','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.vendor_bill_payment_state AS ENUM ('pending','processing','completed','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.recurring_frequency AS ENUM ('weekly','biweekly','monthly','quarterly','yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.expense_claim_status AS ENUM ('draft','submitted','approved','rejected','reimbursed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tax_form_type AS ENUM ('T4A','1099-NEC','1099-MISC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ VENDORS EXTENSION ============
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS tax_id_type TEXT,
  ADD COLUMN IF NOT EXISTS is_1099_t4a BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_expense_account_id UUID REFERENCES public.ledger_accounts(id),
  ADD COLUMN IF NOT EXISTS default_payment_method public.vendor_bill_payment_method,
  ADD COLUMN IF NOT EXISTS payment_rail_details JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS total_paid_ytd NUMERIC(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(20,2) NOT NULL DEFAULT 0;

-- ============ PURCHASE BILLS EXTENSION ============
ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID,
  ADD COLUMN IF NOT EXISTS payment_status public.vendor_bill_payment_status NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS recurring_template_id UUID;

-- ============ PURCHASE ORDERS ============
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT NOT NULL UNIQUE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  status public.po_status NOT NULL DEFAULT 'draft',
  currency_code VARCHAR(10) NOT NULL DEFAULT 'CAD',
  subtotal NUMERIC(20,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  expected_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  approver_id UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "po_finance_all" ON public.purchase_orders;
CREATE POLICY "po_finance_all" ON public.purchase_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance') OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance') OR created_by = auth.uid());
DROP TRIGGER IF EXISTS trg_po_updated ON public.purchase_orders;
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(20,4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(20,4) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  gl_account_id UUID REFERENCES public.ledger_accounts(id),
  qty_received NUMERIC(20,4) NOT NULL DEFAULT 0,
  qty_billed NUMERIC(20,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "poi_finance_all" ON public.purchase_order_items;
CREATE POLICY "poi_finance_all" ON public.purchase_order_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

-- ============ PURCHASE RECEIPTS ============
CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_receipts TO authenticated;
GRANT ALL ON public.purchase_receipts TO service_role;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pr_finance_all" ON public.purchase_receipts;
CREATE POLICY "pr_finance_all" ON public.purchase_receipts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

CREATE TABLE IF NOT EXISTS public.purchase_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id UUID NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
  qty_received NUMERIC(20,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_receipt_items TO authenticated;
GRANT ALL ON public.purchase_receipt_items TO service_role;
ALTER TABLE public.purchase_receipt_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pri_finance_all" ON public.purchase_receipt_items;
CREATE POLICY "pri_finance_all" ON public.purchase_receipt_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));

-- ============ VENDOR BILL PAYMENTS ============
CREATE TABLE IF NOT EXISTS public.vendor_bill_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
  amount NUMERIC(20,2) NOT NULL CHECK (amount > 0),
  currency_code VARCHAR(10) NOT NULL DEFAULT 'CAD',
  payment_method public.vendor_bill_payment_method NOT NULL,
  wallet_id UUID REFERENCES public.wallets(id),
  rail_reference TEXT,
  rail_payload JSONB DEFAULT '{}'::jsonb,
  status public.vendor_bill_payment_state NOT NULL DEFAULT 'pending',
  journal_id UUID,
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  approver_id UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_bill_payments TO authenticated;
GRANT ALL ON public.vendor_bill_payments TO service_role;
ALTER TABLE public.vendor_bill_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vbp_finance_all" ON public.vendor_bill_payments;
CREATE POLICY "vbp_finance_all" ON public.vendor_bill_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));
DROP TRIGGER IF EXISTS trg_vbp_updated ON public.vendor_bill_payments;
CREATE TRIGGER trg_vbp_updated BEFORE UPDATE ON public.vendor_bill_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_vbp_bill ON public.vendor_bill_payments(bill_id);

-- ============ RECURRING BILL TEMPLATES ============
CREATE TABLE IF NOT EXISTS public.recurring_bill_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  frequency public.recurring_frequency NOT NULL,
  day_of_month INT,
  amount NUMERIC(20,2) NOT NULL,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'CAD',
  tax_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  gl_account_id UUID REFERENCES public.ledger_accounts(id),
  description TEXT,
  next_run_at TIMESTAMPTZ NOT NULL,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_pay BOOLEAN NOT NULL DEFAULT false,
  auto_pay_method public.vendor_bill_payment_method,
  auto_pay_wallet_id UUID REFERENCES public.wallets(id),
  last_generated_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_bill_templates TO authenticated;
GRANT ALL ON public.recurring_bill_templates TO service_role;
ALTER TABLE public.recurring_bill_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rbt_finance_all" ON public.recurring_bill_templates;
CREATE POLICY "rbt_finance_all" ON public.recurring_bill_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));
DROP TRIGGER IF EXISTS trg_rbt_updated ON public.recurring_bill_templates;
CREATE TRIGGER trg_rbt_updated BEFORE UPDATE ON public.recurring_bill_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ EXPENSE CLAIMS ============
CREATE TABLE IF NOT EXISTS public.expense_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number TEXT NOT NULL UNIQUE,
  submitter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.expense_claim_status NOT NULL DEFAULT 'draft',
  currency_code VARCHAR(10) NOT NULL DEFAULT 'CAD',
  subtotal NUMERIC(20,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  total NUMERIC(20,2) NOT NULL DEFAULT 0,
  purpose TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  rejected_reason TEXT,
  reimbursement_journal_id UUID,
  reimbursement_method public.vendor_bill_payment_method,
  reimbursed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_claims TO authenticated;
GRANT ALL ON public.expense_claims TO service_role;
ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ec_owner_or_finance_select" ON public.expense_claims;
CREATE POLICY "ec_owner_or_finance_select" ON public.expense_claims FOR SELECT TO authenticated
  USING (submitter_user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));
DROP POLICY IF EXISTS "ec_owner_insert" ON public.expense_claims;
CREATE POLICY "ec_owner_insert" ON public.expense_claims FOR INSERT TO authenticated
  WITH CHECK (submitter_user_id = auth.uid());
DROP POLICY IF EXISTS "ec_owner_or_finance_update" ON public.expense_claims;
CREATE POLICY "ec_owner_or_finance_update" ON public.expense_claims FOR UPDATE TO authenticated
  USING (submitter_user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (submitter_user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));
DROP POLICY IF EXISTS "ec_owner_delete_draft" ON public.expense_claims;
CREATE POLICY "ec_owner_delete_draft" ON public.expense_claims FOR DELETE TO authenticated
  USING (submitter_user_id = auth.uid() AND status = 'draft');
DROP TRIGGER IF EXISTS trg_ec_updated ON public.expense_claims;
CREATE TRIGGER trg_ec_updated BEFORE UPDATE ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.expense_claim_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.expense_claims(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL,
  merchant TEXT,
  category TEXT,
  gl_account_id UUID REFERENCES public.ledger_accounts(id),
  amount NUMERIC(20,2) NOT NULL,
  tax_amount NUMERIC(20,2) NOT NULL DEFAULT 0,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'CAD',
  receipt_url TEXT,
  scanned_data JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_claim_items TO authenticated;
GRANT ALL ON public.expense_claim_items TO service_role;
ALTER TABLE public.expense_claim_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "eci_owner_or_finance" ON public.expense_claim_items;
CREATE POLICY "eci_owner_or_finance" ON public.expense_claim_items FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.expense_claims c WHERE c.id = claim_id
      AND (c.submitter_user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.expense_claims c WHERE c.id = claim_id
      AND (c.submitter_user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance')))
  );

-- ============ TAX FORMS ============
CREATE TABLE IF NOT EXISTS public.tax_form_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  tax_year INT NOT NULL,
  form_type public.tax_form_type NOT NULL,
  total_paid NUMERIC(20,2) NOT NULL DEFAULT 0,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'CAD',
  status TEXT NOT NULL DEFAULT 'draft',
  filed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, tax_year, form_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_form_summaries TO authenticated;
GRANT ALL ON public.tax_form_summaries TO service_role;
ALTER TABLE public.tax_form_summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tfs_finance_all" ON public.tax_form_summaries;
CREATE POLICY "tfs_finance_all" ON public.tax_form_summaries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finance'));
DROP TRIGGER IF EXISTS trg_tfs_updated ON public.tax_form_summaries;
CREATE TRIGGER trg_tfs_updated BEFORE UPDATE ON public.tax_form_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ FKs ============
DO $$ BEGIN
  ALTER TABLE public.purchase_bills
    ADD CONSTRAINT fk_pb_po FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.purchase_bills
    ADD CONSTRAINT fk_pb_recurring FOREIGN KEY (recurring_template_id) REFERENCES public.recurring_bill_templates(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ Number generators ============
CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n INT;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(po_number,'\D','','g'),'')::int),0)+1 INTO n FROM public.purchase_orders;
  RETURN 'PO-' || to_char(now(),'YYYY') || '-' || lpad(n::text,5,'0');
END $$;

CREATE OR REPLACE FUNCTION public.generate_grn_number()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n INT;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(receipt_number,'\D','','g'),'')::int),0)+1 INTO n FROM public.purchase_receipts;
  RETURN 'GRN-' || to_char(now(),'YYYY') || '-' || lpad(n::text,5,'0');
END $$;

CREATE OR REPLACE FUNCTION public.generate_expense_claim_number()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n INT;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(claim_number,'\D','','g'),'')::int),0)+1 INTO n FROM public.expense_claims;
  RETURN 'EXP-' || to_char(now(),'YYYY') || '-' || lpad(n::text,5,'0');
END $$;
