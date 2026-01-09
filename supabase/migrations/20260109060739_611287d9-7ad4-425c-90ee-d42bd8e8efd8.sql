-- Create disputes table for handling customer disputes and refunds
CREATE TABLE public.disputes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_id UUID REFERENCES public.transfers(id),
    customer_id UUID REFERENCES public.customers(id),
    user_id UUID,
    dispute_type VARCHAR(50) NOT NULL CHECK (dispute_type IN ('chargeback', 'refund_request', 'transaction_error', 'unauthorized', 'service_issue', 'other')),
    status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'pending_approval', 'approved', 'rejected', 'resolved', 'escalated')),
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    amount DECIMAL(20, 8),
    currency_code VARCHAR(10),
    reason TEXT NOT NULL,
    customer_statement TEXT,
    evidence_urls TEXT[],
    resolution TEXT,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    assigned_to UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create wallet_operations table for tracking wallet freeze/unfreeze actions
CREATE TABLE public.wallet_operations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_id UUID NOT NULL REFERENCES public.wallets(id),
    operation_type VARCHAR(50) NOT NULL CHECK (operation_type IN ('freeze', 'unfreeze', 'restrict_inbound', 'restrict_outbound', 'close', 'reactivate')),
    reason TEXT NOT NULL,
    performed_by UUID NOT NULL,
    approved_by UUID,
    approval_required BOOLEAN NOT NULL DEFAULT false,
    approved_at TIMESTAMPTZ,
    notes TEXT,
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create transaction_interventions table for manual transaction operations
CREATE TABLE public.transaction_interventions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    transfer_id UUID NOT NULL REFERENCES public.transfers(id),
    intervention_type VARCHAR(50) NOT NULL CHECK (intervention_type IN ('retry', 'cancel', 'switch_provider', 'manual_complete', 'reverse', 'escalate')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'executed', 'failed', 'rejected')),
    reason TEXT NOT NULL,
    initiated_by UUID NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    result TEXT,
    old_provider VARCHAR(100),
    new_provider VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create regulatory_reports table
CREATE TABLE public.regulatory_reports (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('SAR', 'STR', 'CTR', 'FBAR', 'large_transaction', 'cross_border')),
    jurisdiction VARCHAR(10) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'submitted', 'acknowledged')),
    reference_number VARCHAR(100),
    subject_user_id UUID,
    subject_customer_id UUID REFERENCES public.customers(id),
    related_transfers UUID[],
    report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    narrative TEXT,
    filing_deadline TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    submitted_by UUID,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    regulator_acknowledgment TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create customer_communications table for communication hub
CREATE TABLE public.customer_communications (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES public.customers(id),
    user_id UUID,
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('email', 'sms', 'in_app', 'whatsapp', 'push', 'phone_call')),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    subject TEXT,
    content TEXT NOT NULL,
    template_id VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'scheduled', 'sent', 'delivered', 'failed', 'read')),
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create maker_checker_requests table for approval workflows
CREATE TABLE public.maker_checker_requests (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    request_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    action VARCHAR(50) NOT NULL CHECK (action IN ('create', 'update', 'delete', 'freeze', 'unfreeze', 'approve', 'reject', 'reverse', 'override')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
    request_data JSONB NOT NULL,
    reason TEXT,
    maker_id UUID NOT NULL,
    checker_id UUID,
    checker_notes TEXT,
    expires_at TIMESTAMPTZ,
    checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create operations_kpis table for storing calculated KPIs
CREATE TABLE public.operations_kpis (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(20, 4) NOT NULL,
    metric_unit VARCHAR(50),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    dimensions JSONB DEFAULT '{}'::jsonb,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maker_checker_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_kpis ENABLE ROW LEVEL SECURITY;

-- RLS Policies for disputes
CREATE POLICY "Staff can view all disputes"
ON public.disputes FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support') OR public.has_role(auth.uid(), 'compliance') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Staff can create disputes"
ON public.disputes FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support') OR public.has_role(auth.uid(), 'compliance'));

CREATE POLICY "Staff can update disputes"
ON public.disputes FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support') OR public.has_role(auth.uid(), 'compliance'));

-- RLS Policies for wallet_operations
CREATE POLICY "Staff can view wallet operations"
ON public.wallet_operations FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compliance') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Staff can create wallet operations"
ON public.wallet_operations FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compliance'));

-- RLS Policies for transaction_interventions
CREATE POLICY "Staff can view transaction interventions"
ON public.transaction_interventions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support') OR public.has_role(auth.uid(), 'compliance') OR public.has_role(auth.uid(), 'finance'));

CREATE POLICY "Staff can create transaction interventions"
ON public.transaction_interventions FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support') OR public.has_role(auth.uid(), 'compliance'));

CREATE POLICY "Staff can update transaction interventions"
ON public.transaction_interventions FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compliance'));

-- RLS Policies for regulatory_reports
CREATE POLICY "Compliance can view regulatory reports"
ON public.regulatory_reports FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compliance'));

CREATE POLICY "Compliance can manage regulatory reports"
ON public.regulatory_reports FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compliance'));

-- RLS Policies for customer_communications
CREATE POLICY "Staff can view communications"
ON public.customer_communications FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support') OR public.has_role(auth.uid(), 'compliance'));

CREATE POLICY "Staff can create communications"
ON public.customer_communications FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'support'));

-- RLS Policies for maker_checker_requests
CREATE POLICY "Staff can view maker checker requests"
ON public.maker_checker_requests FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compliance') OR public.has_role(auth.uid(), 'finance') OR maker_id = auth.uid());

CREATE POLICY "Staff can create maker checker requests"
ON public.maker_checker_requests FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compliance') OR public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'support'));

CREATE POLICY "Authorized staff can update maker checker requests"
ON public.maker_checker_requests FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compliance'));

-- RLS Policies for operations_kpis
CREATE POLICY "Staff can view KPIs"
ON public.operations_kpis FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'compliance'));

CREATE POLICY "System can insert KPIs"
ON public.operations_kpis FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add updated_at triggers
CREATE TRIGGER update_disputes_updated_at
BEFORE UPDATE ON public.disputes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_regulatory_reports_updated_at
BEFORE UPDATE ON public.regulatory_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_disputes_status ON public.disputes(status);
CREATE INDEX idx_disputes_customer ON public.disputes(customer_id);
CREATE INDEX idx_disputes_transaction ON public.disputes(transaction_id);
CREATE INDEX idx_wallet_operations_wallet ON public.wallet_operations(wallet_id);
CREATE INDEX idx_transaction_interventions_transfer ON public.transaction_interventions(transfer_id);
CREATE INDEX idx_regulatory_reports_status ON public.regulatory_reports(status);
CREATE INDEX idx_customer_communications_customer ON public.customer_communications(customer_id);
CREATE INDEX idx_maker_checker_status ON public.maker_checker_requests(status);