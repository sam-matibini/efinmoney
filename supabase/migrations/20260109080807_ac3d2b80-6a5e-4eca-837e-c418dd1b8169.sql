-- Sales Tax Module - CRA Compliant

-- Enum for tax types
CREATE TYPE public.tax_type AS ENUM ('GST', 'HST', 'QST', 'PST', 'RST');

-- Enum for filing frequency
CREATE TYPE public.tax_filing_frequency AS ENUM ('monthly', 'quarterly', 'annually');

-- Enum for filing status
CREATE TYPE public.tax_filing_status AS ENUM ('draft', 'pending_review', 'approved', 'filed', 'paid');

-- Tax Registrations - Store business tax registration numbers
CREATE TABLE public.tax_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_type tax_type NOT NULL,
  registration_number TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  filing_frequency tax_filing_frequency NOT NULL DEFAULT 'quarterly',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tax Rates by Province
CREATE TABLE public.tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province_code TEXT NOT NULL,
  province_name TEXT NOT NULL,
  tax_type tax_type NOT NULL,
  rate DECIMAL(5,4) NOT NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(province_code, tax_type, effective_from)
);

-- Taxable Service Categories
CREATE TABLE public.taxable_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code TEXT NOT NULL UNIQUE,
  service_name TEXT NOT NULL,
  description TEXT,
  is_taxable BOOLEAN NOT NULL DEFAULT true,
  exemption_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tax Transactions - Track tax on each fee
CREATE TABLE public.tax_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  user_id UUID,
  province_code TEXT NOT NULL,
  taxable_amount DECIMAL(18,2) NOT NULL,
  gst_rate DECIMAL(5,4) DEFAULT 0,
  gst_amount DECIMAL(18,2) DEFAULT 0,
  hst_rate DECIMAL(5,4) DEFAULT 0,
  hst_amount DECIMAL(18,2) DEFAULT 0,
  pst_rate DECIMAL(5,4) DEFAULT 0,
  pst_amount DECIMAL(18,2) DEFAULT 0,
  qst_rate DECIMAL(5,4) DEFAULT 0,
  qst_amount DECIMAL(18,2) DEFAULT 0,
  total_tax DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_with_tax DECIMAL(18,2) NOT NULL,
  is_refunded BOOLEAN NOT NULL DEFAULT false,
  refunded_at TIMESTAMPTZ,
  journal_id UUID,
  invoice_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Input Tax Credits (ITCs) - Track recoverable taxes on expenses
CREATE TABLE public.input_tax_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES public.vendors(id),
  invoice_reference TEXT,
  expense_description TEXT NOT NULL,
  expense_amount DECIMAL(18,2) NOT NULL,
  tax_type tax_type NOT NULL,
  tax_amount DECIMAL(18,2) NOT NULL,
  is_claimed BOOLEAN NOT NULL DEFAULT false,
  claimed_in_filing_id UUID,
  expense_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- Tax Filings - Track filed returns
CREATE TABLE public.tax_filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_type tax_type NOT NULL,
  filing_period_start DATE NOT NULL,
  filing_period_end DATE NOT NULL,
  tax_collected DECIMAL(18,2) NOT NULL DEFAULT 0,
  input_tax_credits DECIMAL(18,2) NOT NULL DEFAULT 0,
  adjustments DECIMAL(18,2) NOT NULL DEFAULT 0,
  net_tax_payable DECIMAL(18,2) NOT NULL DEFAULT 0,
  status tax_filing_status NOT NULL DEFAULT 'draft',
  prepared_by UUID,
  prepared_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  filed_at TIMESTAMPTZ,
  filing_reference TEXT,
  payment_reference TEXT,
  payment_date DATE,
  cra_confirmation TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tax_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxable_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.input_tax_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_filings ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Finance/Admin access
CREATE POLICY "Finance and admin can manage tax registrations"
ON public.tax_registrations FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Finance and admin can manage tax rates"
ON public.tax_rates FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Finance and admin can manage taxable services"
ON public.taxable_services FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Finance and admin can manage tax transactions"
ON public.tax_transactions FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Finance and admin can manage ITCs"
ON public.input_tax_credits FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Finance and admin can manage tax filings"
ON public.tax_filings FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

-- Seed Canadian Provincial Tax Rates (2024)
INSERT INTO public.tax_rates (province_code, province_name, tax_type, rate, effective_from) VALUES
-- HST Provinces
('ON', 'Ontario', 'HST', 0.13, '2024-01-01'),
('NS', 'Nova Scotia', 'HST', 0.15, '2024-01-01'),
('NB', 'New Brunswick', 'HST', 0.15, '2024-01-01'),
('NL', 'Newfoundland and Labrador', 'HST', 0.15, '2024-01-01'),
('PE', 'Prince Edward Island', 'HST', 0.15, '2024-01-01'),
-- GST Only
('AB', 'Alberta', 'GST', 0.05, '2024-01-01'),
('NT', 'Northwest Territories', 'GST', 0.05, '2024-01-01'),
('NU', 'Nunavut', 'GST', 0.05, '2024-01-01'),
('YT', 'Yukon', 'GST', 0.05, '2024-01-01'),
-- GST + PST Provinces
('BC', 'British Columbia', 'GST', 0.05, '2024-01-01'),
('BC', 'British Columbia', 'PST', 0.07, '2024-01-01'),
('SK', 'Saskatchewan', 'GST', 0.05, '2024-01-01'),
('SK', 'Saskatchewan', 'PST', 0.06, '2024-01-01'),
('MB', 'Manitoba', 'GST', 0.05, '2024-01-01'),
('MB', 'Manitoba', 'RST', 0.07, '2024-01-01'),
-- Quebec
('QC', 'Quebec', 'GST', 0.05, '2024-01-01'),
('QC', 'Quebec', 'QST', 0.09975, '2024-01-01');

-- Seed Taxable Service Categories
INSERT INTO public.taxable_services (service_code, service_name, description, is_taxable, exemption_reason) VALUES
('TRANSFER_FEE', 'Transfer Fee', 'Fee charged for money transfer services', true, NULL),
('CONVENIENCE_FEE', 'Convenience Fee', 'Additional convenience or service fee', true, NULL),
('PLATFORM_FEE', 'Platform Fee', 'Platform usage or subscription fee', true, NULL),
('PREMIUM_SUPPORT', 'Premium Support', 'Premium customer support services', true, NULL),
('API_ACCESS', 'API Access Fee', 'API integration access fee', true, NULL),
('FX_PRINCIPAL', 'FX Principal', 'Currency exchange principal amount', false, 'Financial service - CRA exempt'),
('TRANSFER_PRINCIPAL', 'Transfer Principal', 'Money transfer principal amount', false, 'Financial service - CRA exempt'),
('CRYPTO_TRADE', 'Crypto Trading', 'Cryptocurrency trading principal', false, 'Financial instrument - case-specific');

-- Add ledger accounts for tax liabilities
INSERT INTO public.ledger_accounts (code, name, account_type, description, is_system) VALUES
('2310', 'GST Payable', 'liability', 'GST collected on taxable services', true),
('2311', 'HST Payable', 'liability', 'HST collected on taxable services', true),
('2312', 'PST Payable', 'liability', 'PST collected on taxable services', true),
('2313', 'QST Payable', 'liability', 'QST collected on taxable services', true),
('1350', 'GST Recoverable (ITC)', 'asset', 'Input Tax Credits receivable', true),
('1351', 'HST Recoverable (ITC)', 'asset', 'HST Input Tax Credits receivable', true),
('1352', 'QST Recoverable (ITC)', 'asset', 'QST Input Tax Credits receivable', true)
ON CONFLICT (code) DO NOTHING;

-- Create updated_at trigger for tax tables
CREATE TRIGGER update_tax_registrations_updated_at
BEFORE UPDATE ON public.tax_registrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tax_filings_updated_at
BEFORE UPDATE ON public.tax_filings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();