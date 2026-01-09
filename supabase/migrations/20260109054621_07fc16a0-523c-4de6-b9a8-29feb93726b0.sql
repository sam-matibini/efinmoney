-- CRM Activities Table
CREATE TABLE public.crm_activities (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL, -- call, email, meeting, note, task
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    assigned_to UUID REFERENCES auth.users(id),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer Onboarding Steps Table
CREATE TABLE public.onboarding_steps (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    step_order INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_required BOOLEAN NOT NULL DEFAULT true,
    requires_document BOOLEAN NOT NULL DEFAULT false,
    document_type VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer Onboarding Progress Table
CREATE TABLE public.customer_onboarding (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    step_id UUID NOT NULL REFERENCES public.onboarding_steps(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, rejected
    completed_at TIMESTAMPTZ,
    notes TEXT,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(customer_id, step_id)
);

-- Customer Documents Table
CREATE TABLE public.customer_documents (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    onboarding_id UUID REFERENCES public.customer_onboarding(id),
    document_type VARCHAR(100) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer Portal Access Table
CREATE TABLE public.customer_portal_access (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE UNIQUE,
    user_id UUID REFERENCES auth.users(id),
    access_token VARCHAR(255),
    token_expires_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add KYC fields to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS kyc_verified_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS company_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS registration_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS date_of_incorporation DATE,
ADD COLUMN IF NOT EXISTS industry VARCHAR(100),
ADD COLUMN IF NOT EXISTS website VARCHAR(255),
ADD COLUMN IF NOT EXISTS risk_level VARCHAR(50) DEFAULT 'medium';

-- Enable RLS on all new tables
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_portal_access ENABLE ROW LEVEL SECURITY;

-- RLS Policies for crm_activities
CREATE POLICY "Finance can manage CRM activities"
ON public.crm_activities FOR ALL
USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

-- RLS Policies for onboarding_steps
CREATE POLICY "Onboarding steps are readable by authenticated"
ON public.onboarding_steps FOR SELECT
USING (true);

CREATE POLICY "Admins can manage onboarding steps"
ON public.onboarding_steps FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for customer_onboarding
CREATE POLICY "Finance can manage customer onboarding"
ON public.customer_onboarding FOR ALL
USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

-- RLS Policies for customer_documents
CREATE POLICY "Finance can manage customer documents"
ON public.customer_documents FOR ALL
USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

-- RLS Policies for customer_portal_access
CREATE POLICY "Finance can manage portal access"
ON public.customer_portal_access FOR ALL
USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers can view own portal access"
ON public.customer_portal_access FOR SELECT
USING (user_id = auth.uid());

-- Create storage bucket for customer documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('customer-documents', 'customer-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for customer documents
CREATE POLICY "Finance can view customer documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'customer-documents' AND (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin')));

CREATE POLICY "Finance can upload customer documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'customer-documents' AND (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin')));

CREATE POLICY "Finance can delete customer documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'customer-documents' AND (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin')));

-- Insert default onboarding steps
INSERT INTO public.onboarding_steps (step_order, name, description, is_required, requires_document, document_type) VALUES
(1, 'Company Information', 'Basic company details and registration information', true, false, null),
(2, 'Identity Verification', 'Verify identity of company directors/owners', true, true, 'government_id'),
(3, 'Proof of Address', 'Verify company registered address', true, true, 'proof_of_address'),
(4, 'Business Registration', 'Upload business registration documents', true, true, 'business_registration'),
(5, 'Bank Account Details', 'Provide bank account information for transactions', true, false, null),
(6, 'Tax Documentation', 'Tax registration and compliance documents', false, true, 'tax_document'),
(7, 'Terms & Agreement', 'Review and accept terms of service', true, false, null);

-- Trigger to update updated_at
CREATE TRIGGER update_crm_activities_updated_at
BEFORE UPDATE ON public.crm_activities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customer_onboarding_updated_at
BEFORE UPDATE ON public.customer_onboarding
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();