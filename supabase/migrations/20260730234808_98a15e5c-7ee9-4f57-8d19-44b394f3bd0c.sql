-- 1. Settlements table
CREATE TABLE public.partner_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  currency_code varchar(10) NOT NULL,
  period_start date,
  period_end date,
  total_due numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  invoice_count integer NOT NULL DEFAULT 0,
  payment_method text,
  payment_reference text,
  status text NOT NULL DEFAULT 'draft',
  journal_id uuid,
  notes text,
  created_by uuid,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_settlements TO authenticated;
GRANT ALL ON public.partner_settlements TO service_role;

ALTER TABLE public.partner_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing managers manage partner settlements"
  ON public.partner_settlements FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid()))
  WITH CHECK (public.is_pricing_manager(auth.uid()));

CREATE TRIGGER trg_partner_settlements_updated
  BEFORE UPDATE ON public.partner_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX partner_settlements_partner_idx ON public.partner_settlements (partner_id, status);

-- 2. Invoice approval / settlement columns
ALTER TABLE public.partner_invoices
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS journal_id uuid,
  ADD COLUMN IF NOT EXISTS settlement_id uuid REFERENCES public.partner_settlements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disputed_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS partner_invoices_settlement_idx ON public.partner_invoices (settlement_id);

-- 3. Line dispute columns
ALTER TABLE public.partner_invoice_lines
  ADD COLUMN IF NOT EXISTS dispute_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS dispute_reason text;

-- 4. Partner payables account helper (mirrors ensure_fx_clearing_account)
CREATE OR REPLACE FUNCTION public.ensure_partner_payable_account(p_ccy character varying)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; v_code text; v_next int;
BEGIN
  SELECT id INTO v_id FROM public.ledger_accounts
    WHERE currency_code = p_ccy AND name = 'Partner Payables - ' || p_ccy LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT COALESCE(MAX((substring(code from '^22(\d+)$'))::int), 9) + 1 INTO v_next
    FROM public.ledger_accounts WHERE code ~ '^22\d+$';
  v_code := '22' || lpad(v_next::text, 2, '0');

  INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
  VALUES (v_code, 'Partner Payables - ' || p_ccy, 'liability', p_ccy, true, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

-- 5. Network fees expense account helper (per currency, 53xx)
CREATE OR REPLACE FUNCTION public.ensure_network_fee_account(p_ccy character varying)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; v_code text; v_next int;
BEGIN
  SELECT id INTO v_id FROM public.ledger_accounts
    WHERE currency_code = p_ccy AND name = 'Network Fees - ' || p_ccy LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT COALESCE(MAX((substring(code from '^53(\d+)$'))::int), 9) + 1 INTO v_next
    FROM public.ledger_accounts WHERE code ~ '^53\d+$';
  v_code := '53' || lpad(v_next::text, 2, '0');

  INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
  VALUES (v_code, 'Network Fees - ' || p_ccy, 'expense', p_ccy, true, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;