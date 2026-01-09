-- Create customers table
CREATE TABLE public.customers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    tax_id VARCHAR(100),
    payment_terms INTEGER DEFAULT 30,
    credit_limit NUMERIC(20, 2) DEFAULT 0,
    currency_code VARCHAR(10) DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vendors table
CREATE TABLE public.vendors (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    tax_id VARCHAR(100),
    payment_terms INTEGER DEFAULT 30,
    currency_code VARCHAR(10) DEFAULT 'USD',
    bank_account VARCHAR(100),
    bank_name VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create invoice status enum
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled');

-- Create sales invoices table
CREATE TABLE public.sales_invoices (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    status invoice_status NOT NULL DEFAULT 'draft',
    subtotal NUMERIC(20, 2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
    amount_paid NUMERIC(20, 2) NOT NULL DEFAULT 0,
    currency_code VARCHAR(10) NOT NULL DEFAULT 'USD',
    notes TEXT,
    journal_id UUID,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sales invoice line items
CREATE TABLE public.sales_invoice_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id UUID NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(20, 2) NOT NULL,
    tax_rate NUMERIC(5, 2) DEFAULT 0,
    amount NUMERIC(20, 2) NOT NULL,
    account_id UUID REFERENCES public.ledger_accounts(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create purchase bills table
CREATE TABLE public.purchase_bills (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    bill_number VARCHAR(50) NOT NULL,
    vendor_reference VARCHAR(100),
    vendor_id UUID NOT NULL REFERENCES public.vendors(id),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    status invoice_status NOT NULL DEFAULT 'draft',
    subtotal NUMERIC(20, 2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
    amount_paid NUMERIC(20, 2) NOT NULL DEFAULT 0,
    currency_code VARCHAR(10) NOT NULL DEFAULT 'USD',
    notes TEXT,
    journal_id UUID,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create purchase bill line items
CREATE TABLE public.purchase_bill_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    bill_id UUID NOT NULL REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(20, 2) NOT NULL,
    tax_rate NUMERIC(5, 2) DEFAULT 0,
    amount NUMERIC(20, 2) NOT NULL,
    account_id UUID REFERENCES public.ledger_accounts(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bill_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for customers
CREATE POLICY "Finance can manage customers" ON public.customers
    FOR ALL USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

-- RLS Policies for vendors
CREATE POLICY "Finance can manage vendors" ON public.vendors
    FOR ALL USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

-- RLS Policies for sales invoices
CREATE POLICY "Finance can manage sales invoices" ON public.sales_invoices
    FOR ALL USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

-- RLS Policies for sales invoice items
CREATE POLICY "Finance can manage sales invoice items" ON public.sales_invoice_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.sales_invoices si 
            WHERE si.id = invoice_id 
            AND (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'))
        )
    );

-- RLS Policies for purchase bills
CREATE POLICY "Finance can manage purchase bills" ON public.purchase_bills
    FOR ALL USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

-- RLS Policies for purchase bill items
CREATE POLICY "Finance can manage purchase bill items" ON public.purchase_bill_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.purchase_bills pb 
            WHERE pb.id = bill_id 
            AND (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'))
        )
    );

-- Add missing ledger accounts (skip existing ones using ON CONFLICT)
INSERT INTO public.ledger_accounts (code, name, account_type, is_system) VALUES
    ('1600', 'Accounts Receivable', 'asset', true),
    ('2400', 'Accounts Payable', 'liability', true),
    ('4400', 'Sales Revenue', 'income', true),
    ('5100', 'Operating Expenses', 'expense', true)
ON CONFLICT (code) DO NOTHING;

-- Create triggers for updated_at
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at
    BEFORE UPDATE ON public.vendors
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sales_invoices_updated_at
    BEFORE UPDATE ON public.sales_invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_purchase_bills_updated_at
    BEFORE UPDATE ON public.purchase_bills
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();