-- ============================================================
-- REMIT FLOW - COMPLETE DATABASE SCHEMA
-- ============================================================
-- This file contains the complete SQL schema to recreate the
-- database structure in your own Supabase project.
--
-- SETUP INSTRUCTIONS:
-- 1. Create a new Supabase project at https://supabase.com
-- 2. Go to SQL Editor in your Supabase dashboard
-- 3. Run this script section by section (or all at once)
-- 4. Configure authentication settings in your dashboard
-- 5. Deploy the edge functions from supabase/functions/
-- ============================================================

-- ============================================================
-- SECTION 1: ENUMS
-- ============================================================

-- Application roles
CREATE TYPE public.app_role AS ENUM ('user', 'admin', 'compliance', 'support', 'finance');

-- Wallet status
CREATE TYPE public.wallet_status AS ENUM ('active', 'frozen', 'suspended', 'closed');

-- Transfer status
CREATE TYPE public.transfer_status AS ENUM ('initiated', 'funded', 'processing', 'completed', 'failed', 'reversed', 'expired');

-- Transfer type
CREATE TYPE public.transfer_type AS ENUM ('internal', 'mobile_money', 'bank', 'crypto');

-- Alert severity
CREATE TYPE public.alert_severity AS ENUM ('low', 'medium', 'high', 'critical');

-- Alert status
CREATE TYPE public.alert_status AS ENUM ('open', 'investigating', 'escalated', 'resolved', 'false_positive');

-- Currency type
CREATE TYPE public.currency_type AS ENUM ('fiat', 'crypto');

-- KYC status
CREATE TYPE public.kyc_status AS ENUM ('pending', 'submitted', 'verified', 'rejected', 'expired');

-- KYC tier
CREATE TYPE public.kyc_tier AS ENUM ('tier_0', 'tier_1', 'tier_2', 'tier_3');

-- Trade side
CREATE TYPE public.trade_side AS ENUM ('buy', 'sell');

-- Trade status
CREATE TYPE public.trade_status AS ENUM ('pending', 'executed', 'cancelled', 'failed');

-- Account type (for ledger)
CREATE TYPE public.account_type AS ENUM ('asset', 'liability', 'income', 'expense', 'equity');

-- Invoice status
CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled');

-- Reconciliation status
CREATE TYPE public.reconciliation_status AS ENUM ('pending', 'matched', 'unmatched', 'exception', 'resolved');

-- Tax types (Canadian)
CREATE TYPE public.tax_type AS ENUM ('GST', 'HST', 'QST', 'PST', 'RST');

-- Tax filing frequency
CREATE TYPE public.tax_filing_frequency AS ENUM ('monthly', 'quarterly', 'annually');

-- Tax filing status
CREATE TYPE public.tax_filing_status AS ENUM ('draft', 'pending_review', 'approved', 'filed', 'paid');


-- ============================================================
-- SECTION 2: CORE TABLES
-- ============================================================

-- Currencies
CREATE TABLE public.currencies (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    currency_type public.currency_type NOT NULL DEFAULT 'fiat',
    decimal_places INTEGER NOT NULL DEFAULT 2,
    flag_emoji VARCHAR(10),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User profiles (extends auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    email VARCHAR(255),
    full_name VARCHAR(255),
    phone_number VARCHAR(50),
    country_code VARCHAR(10),
    avatar_url TEXT,
    kyc_status public.kyc_status NOT NULL DEFAULT 'pending',
    kyc_tier public.kyc_tier NOT NULL DEFAULT 'tier_0',
    risk_score INTEGER,
    default_currency VARCHAR(10) REFERENCES public.currencies(code),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles (separate table for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    role public.app_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, role)
);

-- Wallets
CREATE TABLE public.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    currency_code VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    is_default BOOLEAN NOT NULL DEFAULT false,
    status public.wallet_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ledger accounts (Chart of Accounts)
CREATE TABLE public.ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    account_type public.account_type NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES public.ledger_accounts(id),
    currency_code VARCHAR(10) REFERENCES public.currencies(code),
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ledger entries (double-entry)
CREATE TABLE public.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id UUID NOT NULL,
    account_id UUID NOT NULL REFERENCES public.ledger_accounts(id),
    wallet_id UUID REFERENCES public.wallets(id),
    currency_code VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    debit_amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
    credit_amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
    description TEXT,
    reference_type VARCHAR(50),
    reference_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- SECTION 3: TRANSFER & FX TABLES
-- ============================================================

-- Transfers
CREATE TABLE public.transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL,
    sender_wallet_id UUID NOT NULL REFERENCES public.wallets(id),
    recipient_name VARCHAR(255) NOT NULL,
    recipient_phone VARCHAR(50),
    recipient_account VARCHAR(100),
    recipient_country VARCHAR(10) NOT NULL,
    source_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    target_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    source_amount DECIMAL(20, 8) NOT NULL,
    target_amount DECIMAL(20, 8) NOT NULL,
    exchange_rate DECIMAL(20, 8) NOT NULL DEFAULT 1,
    fee_amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
    transfer_type public.transfer_type NOT NULL,
    status public.transfer_status NOT NULL DEFAULT 'initiated',
    payout_method VARCHAR(50),
    provider_reference VARCHAR(255),
    failure_reason TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FX rates
CREATE TABLE public.fx_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    to_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    rate DECIMAL(20, 8) NOT NULL,
    markup_rate DECIMAL(10, 6) NOT NULL DEFAULT 0.02,
    effective_rate DECIMAL(20, 8) NOT NULL,
    source VARCHAR(50),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FX transactions
CREATE TABLE public.fx_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    from_wallet_id UUID NOT NULL REFERENCES public.wallets(id),
    to_wallet_id UUID NOT NULL REFERENCES public.wallets(id),
    from_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    to_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    from_amount DECIMAL(20, 8) NOT NULL,
    to_amount DECIMAL(20, 8) NOT NULL,
    market_rate DECIMAL(20, 8) NOT NULL,
    markup_rate DECIMAL(10, 6) NOT NULL DEFAULT 0,
    effective_rate DECIMAL(20, 8) NOT NULL,
    fee_amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
    rate_locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rate_expires_at TIMESTAMPTZ NOT NULL,
    status public.trade_status NOT NULL DEFAULT 'pending',
    journal_id UUID,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- SECTION 4: CRYPTO TRADING TABLES
-- ============================================================

-- Crypto pairs
CREATE TABLE public.crypto_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    quote_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    trading_fee_percent DECIMAL(10, 6) NOT NULL DEFAULT 0.01,
    min_trade_amount DECIMAL(20, 8) NOT NULL DEFAULT 0.00001,
    max_trade_amount DECIMAL(20, 8),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Crypto trades
CREATE TABLE public.crypto_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    pair_id UUID NOT NULL REFERENCES public.crypto_pairs(id),
    side public.trade_side NOT NULL,
    base_amount DECIMAL(20, 8) NOT NULL,
    quote_amount DECIMAL(20, 8) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    fee_amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
    fee_currency VARCHAR(10) REFERENCES public.currencies(code),
    status public.trade_status NOT NULL DEFAULT 'pending',
    base_wallet_id UUID REFERENCES public.wallets(id),
    quote_wallet_id UUID REFERENCES public.wallets(id),
    journal_id UUID,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- SECTION 5: COMPLIANCE TABLES
-- ============================================================

-- Compliance rules
CREATE TABLE public.compliance_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_code VARCHAR(50) NOT NULL UNIQUE,
    rule_name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(50) NOT NULL,
    description TEXT,
    parameters JSONB NOT NULL DEFAULT '{}',
    severity public.alert_severity NOT NULL DEFAULT 'medium',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Compliance alerts
CREATE TABLE public.compliance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    rule_id UUID NOT NULL REFERENCES public.compliance_rules(id),
    transfer_id UUID REFERENCES public.transfers(id),
    severity public.alert_severity NOT NULL,
    status public.alert_status NOT NULL DEFAULT 'open',
    alert_data JSONB NOT NULL DEFAULT '{}',
    notes TEXT,
    assigned_to UUID,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Compliance reports
CREATE TABLE public.compliance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(50) NOT NULL,
    reporting_period_start DATE NOT NULL,
    reporting_period_end DATE NOT NULL,
    jurisdiction VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    report_data JSONB NOT NULL DEFAULT '{}',
    filed_by UUID,
    filed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Regulatory reports
CREATE TABLE public.regulatory_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(50) NOT NULL,
    jurisdiction VARCHAR(50) NOT NULL,
    subject_user_id UUID,
    subject_customer_id UUID,
    related_transfers TEXT[],
    narrative TEXT,
    report_data JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    reference_number VARCHAR(100),
    filing_deadline DATE,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    submitted_by UUID,
    submitted_at TIMESTAMPTZ,
    regulator_acknowledgment TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- SECTION 6: BANKING & RECONCILIATION TABLES
-- ============================================================

-- Bank accounts
CREATE TABLE public.bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name VARCHAR(255) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    routing_number VARCHAR(50),
    swift_code VARCHAR(20),
    account_type VARCHAR(50) NOT NULL DEFAULT 'checking',
    currency_code VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    ledger_account_id UUID REFERENCES public.ledger_accounts(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_reconciled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bank transactions
CREATE TABLE public.bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id),
    transaction_date DATE NOT NULL,
    post_date DATE,
    description TEXT NOT NULL,
    reference VARCHAR(255),
    debit_amount DECIMAL(20, 8),
    credit_amount DECIMAL(20, 8),
    balance DECIMAL(20, 8),
    category VARCHAR(100),
    is_categorized BOOLEAN NOT NULL DEFAULT false,
    is_posted BOOLEAN NOT NULL DEFAULT false,
    rule_id UUID,
    debit_account_id UUID REFERENCES public.ledger_accounts(id),
    credit_account_id UUID REFERENCES public.ledger_accounts(id),
    journal_id UUID,
    ai_confidence DECIMAL(5, 2),
    import_batch_id VARCHAR(100),
    raw_data JSONB,
    categorized_at TIMESTAMPTZ,
    posted_at TIMESTAMPTZ,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transaction rules
CREATE TABLE public.transaction_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    match_field VARCHAR(50) NOT NULL DEFAULT 'description',
    match_type VARCHAR(50) NOT NULL DEFAULT 'contains',
    match_value TEXT NOT NULL,
    category VARCHAR(100),
    debit_account_id UUID REFERENCES public.ledger_accounts(id),
    credit_account_id UUID REFERENCES public.ledger_accounts(id),
    auto_post BOOLEAN NOT NULL DEFAULT false,
    ai_generated BOOLEAN NOT NULL DEFAULT false,
    ai_confidence DECIMAL(5, 2),
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reconciliation records
CREATE TABLE public.reconciliation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_transaction_id UUID REFERENCES public.bank_transactions(id),
    transfer_id UUID REFERENCES public.transfers(id),
    ledger_entry_id UUID REFERENCES public.ledger_entries(id),
    matched_amount DECIMAL(20, 8),
    status public.reconciliation_status NOT NULL DEFAULT 'pending',
    match_confidence DECIMAL(5, 2),
    match_reason TEXT,
    exception_reason TEXT,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add foreign key for bank_transactions.rule_id
ALTER TABLE public.bank_transactions
ADD CONSTRAINT bank_transactions_rule_id_fkey
FOREIGN KEY (rule_id) REFERENCES public.transaction_rules(id);


-- ============================================================
-- SECTION 7: CRM TABLES
-- ============================================================

-- Customers (business customers)
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    tax_id VARCHAR(100),
    registration_number VARCHAR(100),
    company_type VARCHAR(50),
    industry VARCHAR(100),
    website VARCHAR(255),
    date_of_incorporation DATE,
    currency_code VARCHAR(10),
    credit_limit DECIMAL(20, 2),
    payment_terms INTEGER DEFAULT 30,
    kyc_status VARCHAR(50),
    kyc_verified_at TIMESTAMPTZ,
    kyc_verified_by UUID,
    risk_level VARCHAR(50),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    onboarding_started_at TIMESTAMPTZ,
    onboarding_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CRM activities
CREATE TABLE public.crm_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    activity_type VARCHAR(50) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    assigned_to UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Onboarding steps
CREATE TABLE public.onboarding_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    step_order INTEGER NOT NULL,
    is_required BOOLEAN NOT NULL DEFAULT true,
    requires_document BOOLEAN NOT NULL DEFAULT false,
    document_type VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer onboarding
CREATE TABLE public.customer_onboarding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    step_id UUID NOT NULL REFERENCES public.onboarding_steps(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    notes TEXT,
    completed_at TIMESTAMPTZ,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer documents
CREATE TABLE public.customer_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    onboarding_id UUID REFERENCES public.customer_onboarding(id),
    document_type VARCHAR(100) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer portal access
CREATE TABLE public.customer_portal_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL UNIQUE REFERENCES public.customers(id),
    user_id UUID,
    access_token VARCHAR(255),
    token_expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer communications
CREATE TABLE public.customer_communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id),
    user_id UUID,
    channel VARCHAR(50) NOT NULL,
    direction VARCHAR(50) NOT NULL,
    subject VARCHAR(255),
    content TEXT NOT NULL,
    template_id VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    metadata JSONB,
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- SECTION 8: INVOICING TABLES
-- ============================================================

-- Vendors
CREATE TABLE public.vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    tax_id VARCHAR(100),
    currency_code VARCHAR(10),
    payment_terms INTEGER DEFAULT 30,
    bank_name VARCHAR(255),
    bank_account VARCHAR(100),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sales invoices
CREATE TABLE public.sales_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    currency_code VARCHAR(10) NOT NULL DEFAULT 'CAD',
    subtotal DECIMAL(20, 2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(20, 2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(20, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(20, 2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(20, 2) NOT NULL DEFAULT 0,
    status public.invoice_status NOT NULL DEFAULT 'draft',
    notes TEXT,
    journal_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sales invoice items
CREATE TABLE public.sales_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(20, 4) NOT NULL DEFAULT 1,
    unit_price DECIMAL(20, 4) NOT NULL,
    tax_rate DECIMAL(10, 4),
    amount DECIMAL(20, 2) NOT NULL,
    account_id UUID REFERENCES public.ledger_accounts(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Purchase bills
CREATE TABLE public.purchase_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_number VARCHAR(50) NOT NULL,
    vendor_id UUID NOT NULL REFERENCES public.vendors(id),
    vendor_reference VARCHAR(100),
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    currency_code VARCHAR(10) NOT NULL DEFAULT 'CAD',
    subtotal DECIMAL(20, 2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(20, 2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(20, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(20, 2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(20, 2) NOT NULL DEFAULT 0,
    status public.invoice_status NOT NULL DEFAULT 'draft',
    notes TEXT,
    journal_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Purchase bill items
CREATE TABLE public.purchase_bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id UUID NOT NULL REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(20, 4) NOT NULL DEFAULT 1,
    unit_price DECIMAL(20, 4) NOT NULL,
    tax_rate DECIMAL(10, 4),
    amount DECIMAL(20, 2) NOT NULL,
    account_id UUID REFERENCES public.ledger_accounts(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- SECTION 9: CANADIAN TAX TABLES
-- ============================================================

-- Tax rates by province
CREATE TABLE public.tax_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    province_code VARCHAR(10) NOT NULL,
    province_name VARCHAR(100) NOT NULL,
    tax_type public.tax_type NOT NULL,
    rate DECIMAL(10, 6) NOT NULL,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tax registrations
CREATE TABLE public.tax_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_type public.tax_type NOT NULL,
    registration_number VARCHAR(100) NOT NULL UNIQUE,
    legal_name VARCHAR(255) NOT NULL,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    filing_frequency public.tax_filing_frequency NOT NULL DEFAULT 'quarterly',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tax filings
CREATE TABLE public.tax_filings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_type public.tax_type NOT NULL,
    filing_period_start DATE NOT NULL,
    filing_period_end DATE NOT NULL,
    tax_collected DECIMAL(20, 2) NOT NULL DEFAULT 0,
    input_tax_credits DECIMAL(20, 2) NOT NULL DEFAULT 0,
    adjustments DECIMAL(20, 2) NOT NULL DEFAULT 0,
    net_tax_payable DECIMAL(20, 2) NOT NULL DEFAULT 0,
    status public.tax_filing_status NOT NULL DEFAULT 'draft',
    notes TEXT,
    prepared_by UUID,
    prepared_at TIMESTAMPTZ,
    reviewed_by UUID,
    reviewed_at TIMESTAMPTZ,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    filed_at TIMESTAMPTZ,
    filing_reference VARCHAR(100),
    cra_confirmation VARCHAR(100),
    payment_date DATE,
    payment_reference VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tax transactions
CREATE TABLE public.tax_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(100) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    province_code VARCHAR(10) NOT NULL,
    taxable_amount DECIMAL(20, 2) NOT NULL,
    gst_rate DECIMAL(10, 6),
    gst_amount DECIMAL(20, 2),
    pst_rate DECIMAL(10, 6),
    pst_amount DECIMAL(20, 2),
    hst_rate DECIMAL(10, 6),
    hst_amount DECIMAL(20, 2),
    qst_rate DECIMAL(10, 6),
    qst_amount DECIMAL(20, 2),
    total_tax DECIMAL(20, 2) NOT NULL DEFAULT 0,
    total_with_tax DECIMAL(20, 2) NOT NULL,
    is_refunded BOOLEAN NOT NULL DEFAULT false,
    refunded_at TIMESTAMPTZ,
    user_id UUID,
    customer_id UUID REFERENCES public.customers(id),
    invoice_number VARCHAR(100),
    journal_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Taxable services
CREATE TABLE public.taxable_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_code VARCHAR(50) NOT NULL UNIQUE,
    service_name VARCHAR(255) NOT NULL,
    description TEXT,
    is_taxable BOOLEAN NOT NULL DEFAULT true,
    exemption_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Input tax credits
CREATE TABLE public.input_tax_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES public.vendors(id),
    expense_date DATE NOT NULL,
    expense_description TEXT NOT NULL,
    expense_amount DECIMAL(20, 2) NOT NULL,
    tax_type public.tax_type NOT NULL,
    tax_amount DECIMAL(20, 2) NOT NULL,
    invoice_reference VARCHAR(100),
    is_claimed BOOLEAN NOT NULL DEFAULT false,
    claimed_in_filing_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- SECTION 10: OPERATIONS TABLES
-- ============================================================

-- Wallet operations
CREATE TABLE public.wallet_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES public.wallets(id),
    operation_type VARCHAR(50) NOT NULL,
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    reason TEXT NOT NULL,
    notes TEXT,
    performed_by UUID NOT NULL,
    approval_required BOOLEAN NOT NULL DEFAULT false,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Disputes
CREATE TABLE public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    customer_id UUID REFERENCES public.customers(id),
    transaction_id UUID REFERENCES public.transfers(id),
    dispute_type VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    customer_statement TEXT,
    amount DECIMAL(20, 2),
    currency_code VARCHAR(10),
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    priority VARCHAR(50) NOT NULL DEFAULT 'medium',
    evidence_urls TEXT[],
    resolution TEXT,
    assigned_to UUID,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transaction interventions
CREATE TABLE public.transaction_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES public.transfers(id),
    intervention_type VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    old_provider VARCHAR(100),
    new_provider VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    result TEXT,
    initiated_by UUID NOT NULL,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Maker-checker requests
CREATE TABLE public.maker_checker_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    action VARCHAR(50) NOT NULL,
    request_data JSONB NOT NULL,
    reason TEXT,
    maker_id UUID NOT NULL,
    checker_id UUID,
    checker_notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    checked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Operations KPIs
CREATE TABLE public.operations_kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(20, 6) NOT NULL,
    metric_unit VARCHAR(50),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    dimensions JSONB,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rate limits
CREATE TABLE public.rate_limits (
    key VARCHAR(255) PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id VARCHAR(100),
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- SECTION 11: INDEXES
-- ============================================================

-- Performance indexes
CREATE INDEX idx_wallets_user_id ON public.wallets(user_id);
CREATE INDEX idx_wallets_currency ON public.wallets(currency_code);
CREATE INDEX idx_transfers_sender ON public.transfers(sender_id);
CREATE INDEX idx_transfers_status ON public.transfers(status);
CREATE INDEX idx_transfers_created ON public.transfers(created_at DESC);
CREATE INDEX idx_ledger_entries_journal ON public.ledger_entries(journal_id);
CREATE INDEX idx_ledger_entries_wallet ON public.ledger_entries(wallet_id);
CREATE INDEX idx_ledger_entries_account ON public.ledger_entries(account_id);
CREATE INDEX idx_compliance_alerts_user ON public.compliance_alerts(user_id);
CREATE INDEX idx_compliance_alerts_status ON public.compliance_alerts(status);
CREATE INDEX idx_bank_transactions_account ON public.bank_transactions(bank_account_id);
CREATE INDEX idx_bank_transactions_date ON public.bank_transactions(transaction_date);
CREATE INDEX idx_crm_activities_customer ON public.crm_activities(customer_id);
CREATE INDEX idx_customer_documents_customer ON public.customer_documents(customer_id);
CREATE INDEX idx_fx_rates_pair ON public.fx_rates(from_currency, to_currency);
CREATE INDEX idx_crypto_trades_user ON public.crypto_trades(user_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);


-- ============================================================
-- SECTION 12: DATABASE FUNCTIONS
-- ============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function to check if user has a role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_is_admin boolean;
BEGIN
  -- Allow if the caller is checking their own roles
  IF auth.uid() = _user_id THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    );
  END IF;
  
  -- Check if caller is an admin (they can check anyone's roles)
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) INTO caller_is_admin;
  
  IF caller_is_admin THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    );
  END IF;
  
  -- Deny access
  RETURN false;
END;
$$;

-- Function to get wallet balance
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_wallet_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    balance DECIMAL(20, 8);
    v_owner_id UUID;
BEGIN
    SELECT user_id INTO v_owner_id FROM public.wallets WHERE id = p_wallet_id;
    
    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;
    
    IF auth.uid() IS NOT NULL THEN
        IF v_owner_id != auth.uid() 
           AND NOT public.has_role(auth.uid(), 'admin') 
           AND NOT public.has_role(auth.uid(), 'finance') THEN
            RAISE EXCEPTION 'Unauthorized';
        END IF;
    END IF;
    
    SELECT COALESCE(SUM(credit_amount) - SUM(debit_amount), 0)
    INTO balance
    FROM public.ledger_entries
    WHERE wallet_id = p_wallet_id;
    
    RETURN balance;
END;
$$;

-- Function to get user wallet balances
CREATE OR REPLACE FUNCTION public.get_user_wallet_balances(p_user_id uuid)
RETURNS TABLE(
    wallet_id uuid, 
    currency_code character varying, 
    currency_name character varying, 
    symbol character varying, 
    flag_emoji character varying, 
    balance numeric, 
    status wallet_status, 
    is_default boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
    IF p_user_id != auth.uid() 
       AND NOT public.has_role(auth.uid(), 'admin') 
       AND NOT public.has_role(auth.uid(), 'finance') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    RETURN QUERY
    SELECT 
        w.id as wallet_id,
        w.currency_code,
        c.name as currency_name,
        c.symbol,
        c.flag_emoji,
        public.get_wallet_balance(w.id) as balance,
        w.status,
        w.is_default
    FROM public.wallets w
    JOIN public.currencies c ON w.currency_code = c.code
    WHERE w.user_id = p_user_id
    ORDER BY w.is_default DESC, c.name;
END;
$$;

-- Function to execute FX swap
CREATE OR REPLACE FUNCTION public.execute_fx_swap(
    p_user_id uuid, 
    p_from_wallet_id uuid, 
    p_to_wallet_id uuid, 
    p_from_amount numeric, 
    p_effective_rate numeric, 
    p_fee_amount numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_journal_id UUID := gen_random_uuid();
    v_from_currency VARCHAR(10);
    v_to_currency VARCHAR(10);
    v_to_amount DECIMAL;
    v_from_liability_account UUID;
    v_to_liability_account UUID;
    v_fx_revenue_account UUID;
    v_from_wallet_owner UUID;
    v_to_wallet_owner UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
    IF auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    SELECT user_id INTO v_from_wallet_owner FROM wallets WHERE id = p_from_wallet_id;
    SELECT user_id INTO v_to_wallet_owner FROM wallets WHERE id = p_to_wallet_id;
    
    IF v_from_wallet_owner IS NULL OR v_to_wallet_owner IS NULL THEN
        RAISE EXCEPTION 'Wallet not found';
    END IF;
    
    IF v_from_wallet_owner != auth.uid() OR v_to_wallet_owner != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    
    SELECT currency_code INTO v_from_currency FROM wallets WHERE id = p_from_wallet_id;
    SELECT currency_code INTO v_to_currency FROM wallets WHERE id = p_to_wallet_id;
    
    v_to_amount := (p_from_amount - p_fee_amount) * p_effective_rate;
    
    SELECT id INTO v_from_liability_account FROM ledger_accounts 
        WHERE code LIKE '21%' AND currency_code = v_from_currency LIMIT 1;
    SELECT id INTO v_to_liability_account FROM ledger_accounts 
        WHERE code LIKE '21%' AND currency_code = v_to_currency LIMIT 1;
    SELECT id INTO v_fx_revenue_account FROM ledger_accounts WHERE code = '4100';
    
    INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
    VALUES (v_journal_id, v_from_liability_account, p_from_wallet_id, v_from_currency, p_from_amount, 0, 'FX Swap - Debit', 'fx', p_user_id);
    
    INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
    VALUES (v_journal_id, v_to_liability_account, p_to_wallet_id, v_to_currency, 0, v_to_amount, 'FX Swap - Credit', 'fx', p_user_id);
    
    IF p_fee_amount > 0 THEN
        INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
        VALUES (v_journal_id, v_fx_revenue_account, NULL, v_from_currency, 0, p_fee_amount, 'FX Fee Revenue', 'fx', p_user_id);
    END IF;
    
    RETURN v_journal_id;
END;
$$;

-- Function to check rate limits
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key varchar, 
    p_max_requests integer, 
    p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    DELETE FROM rate_limits WHERE expires_at < now();
    
    SELECT count, expires_at INTO v_count, v_expires_at
    FROM rate_limits
    WHERE key = p_key AND expires_at > now();
    
    IF v_count IS NULL THEN
        INSERT INTO rate_limits (key, count, expires_at)
        VALUES (p_key, 1, now() + (p_window_seconds || ' seconds')::interval)
        ON CONFLICT (key) DO UPDATE SET
            count = CASE 
                WHEN rate_limits.expires_at < now() THEN 1
                ELSE rate_limits.count + 1
            END,
            expires_at = CASE
                WHEN rate_limits.expires_at < now() THEN now() + (p_window_seconds || ' seconds')::interval
                ELSE rate_limits.expires_at
            END;
        RETURN TRUE;
    ELSIF v_count >= p_max_requests THEN
        RETURN FALSE;
    ELSE
        UPDATE rate_limits SET count = count + 1 WHERE key = p_key;
        RETURN TRUE;
    END IF;
END;
$$;

-- Function to run compliance checks
CREATE OR REPLACE FUNCTION public.run_compliance_checks(p_transfer_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_transfer RECORD;
    v_rule RECORD;
    v_alert_count INTEGER := 0;
    v_daily_count INTEGER;
    v_daily_amount DECIMAL;
BEGIN
    SELECT * INTO v_transfer FROM transfers WHERE id = p_transfer_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    FOR v_rule IN SELECT * FROM compliance_rules WHERE is_active = true LOOP
        -- Velocity check
        IF v_rule.rule_type = 'velocity' THEN
            SELECT COUNT(*) INTO v_daily_count
            FROM transfers
            WHERE sender_id = v_transfer.sender_id
              AND created_at > now() - interval '24 hours';
            
            IF v_daily_count > COALESCE((v_rule.parameters->>'max_transactions')::int, 10) THEN
                INSERT INTO compliance_alerts (user_id, rule_id, transfer_id, severity, alert_data)
                VALUES (v_transfer.sender_id, v_rule.id, p_transfer_id, v_rule.severity, 
                    jsonb_build_object('daily_count', v_daily_count));
                v_alert_count := v_alert_count + 1;
            END IF;
        END IF;
        
        -- Amount check
        IF v_rule.rule_type = 'amount' THEN
            IF v_transfer.source_amount > COALESCE((v_rule.parameters->>'threshold_usd')::decimal, 10000) THEN
                INSERT INTO compliance_alerts (user_id, rule_id, transfer_id, severity, alert_data)
                VALUES (v_transfer.sender_id, v_rule.id, p_transfer_id, v_rule.severity,
                    jsonb_build_object('amount', v_transfer.source_amount));
                v_alert_count := v_alert_count + 1;
            END IF;
        END IF;
    END LOOP;
    
    RETURN v_alert_count;
END;
$$;

-- Function to validate compliance parameters
CREATE OR REPLACE FUNCTION public.validate_compliance_parameters(
    p_rule_type varchar, 
    p_parameters jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_rule_type = 'velocity' THEN
        IF NOT (p_parameters ? 'period_hours' AND p_parameters ? 'max_transactions') THEN
            RAISE EXCEPTION 'Velocity rule requires period_hours and max_transactions';
        END IF;
    ELSIF p_rule_type = 'amount' THEN
        IF NOT (p_parameters ? 'threshold_usd') THEN
            RAISE EXCEPTION 'Amount rule requires threshold_usd';
        END IF;
    ELSIF p_rule_type = 'structuring' THEN
        IF NOT (p_parameters ? 'threshold_usd' AND p_parameters ? 'window_hours' AND p_parameters ? 'min_transactions') THEN
            RAISE EXCEPTION 'Structuring rule requires threshold_usd, window_hours, and min_transactions';
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$$;

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email)
    VALUES (NEW.id, NEW.email);
    
    INSERT INTO public.wallets (user_id, currency_code, is_default) VALUES
        (NEW.id, 'USD', true),
        (NEW.id, 'CAD', false);
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
    
    RETURN NEW;
END;
$$;


-- ============================================================
-- SECTION 13: TRIGGERS
-- ============================================================

-- Updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON public.wallets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transfers_updated_at BEFORE UPDATE ON public.transfers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_crm_activities_updated_at BEFORE UPDATE ON public.crm_activities
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON public.vendors
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sales_invoices_updated_at BEFORE UPDATE ON public.sales_invoices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_purchase_bills_updated_at BEFORE UPDATE ON public.purchase_bills
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON public.disputes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_regulatory_reports_updated_at BEFORE UPDATE ON public.regulatory_reports
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transaction_rules_updated_at BEFORE UPDATE ON public.transaction_rules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tax_registrations_updated_at BEFORE UPDATE ON public.tax_registrations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tax_filings_updated_at BEFORE UPDATE ON public.tax_filings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customer_onboarding_updated_at BEFORE UPDATE ON public.customer_onboarding
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- NOTE: The trigger for auth.users to call handle_new_user() must be created
-- via the Supabase dashboard or using the migration tool as it involves the auth schema:
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- SECTION 14: ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_portal_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxable_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.input_tax_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maker_checker_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SECTION 15: RLS POLICIES
-- ============================================================

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- User roles policies (read-only for users)
CREATE POLICY "Users can view own roles" ON public.user_roles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" ON public.user_roles
    FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Wallets policies
CREATE POLICY "Users can view own wallets" ON public.wallets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own wallets" ON public.wallets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wallets" ON public.wallets
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own wallets" ON public.wallets
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all wallets" ON public.wallets
    FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Currencies (public read)
CREATE POLICY "Currencies are publicly readable" ON public.currencies
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage currencies" ON public.currencies
    FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Crypto pairs (public read)
CREATE POLICY "Crypto pairs are publicly readable" ON public.crypto_pairs
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage crypto pairs" ON public.crypto_pairs
    FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Crypto trades
CREATE POLICY "Users can view own crypto trades" ON public.crypto_trades
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create crypto trades" ON public.crypto_trades
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Finance can view all crypto trades" ON public.crypto_trades
    FOR SELECT USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

-- Transfers
CREATE POLICY "Users can view own transfers" ON public.transfers
    FOR SELECT USING (auth.uid() = sender_id);

CREATE POLICY "Users can create transfers" ON public.transfers
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Finance can view all transfers" ON public.transfers
    FOR SELECT USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

-- Compliance rules
CREATE POLICY "Compliance can view rules" ON public.compliance_rules
    FOR SELECT USING (has_role(auth.uid(), 'compliance') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage compliance rules" ON public.compliance_rules
    FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Compliance alerts
CREATE POLICY "Compliance can view alerts" ON public.compliance_alerts
    FOR SELECT USING (has_role(auth.uid(), 'compliance') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Compliance can manage alerts" ON public.compliance_alerts
    FOR ALL USING (has_role(auth.uid(), 'compliance') OR has_role(auth.uid(), 'admin'));

-- Bank accounts
CREATE POLICY "Finance can view bank accounts" ON public.bank_accounts
    FOR SELECT USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage bank accounts" ON public.bank_accounts
    FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Bank transactions
CREATE POLICY "Finance can view bank transactions" ON public.bank_transactions
    FOR SELECT USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Finance can insert bank transactions" ON public.bank_transactions
    FOR INSERT WITH CHECK (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Finance can update bank transactions" ON public.bank_transactions
    FOR UPDATE USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

-- CRM Activities
CREATE POLICY "Finance can manage CRM activities" ON public.crm_activities
    FOR ALL USING (has_role(auth.uid(), 'finance') OR has_role(auth.uid(), 'admin'));

-- Audit logs
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
    FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'compliance'));

CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (
        (user_id = auth.uid()) 
        OR has_role(auth.uid(), 'admin') 
        OR has_role(auth.uid(), 'compliance')
    );


-- ============================================================
-- SECTION 16: SEED DATA
-- ============================================================

-- Insert default currencies
INSERT INTO public.currencies (code, name, symbol, currency_type, decimal_places, flag_emoji) VALUES
    ('USD', 'US Dollar', '$', 'fiat', 2, '🇺🇸'),
    ('CAD', 'Canadian Dollar', 'CA$', 'fiat', 2, '🇨🇦'),
    ('EUR', 'Euro', '€', 'fiat', 2, '🇪🇺'),
    ('GBP', 'British Pound', '£', 'fiat', 2, '🇬🇧'),
    ('NGN', 'Nigerian Naira', '₦', 'fiat', 2, '🇳🇬'),
    ('GHS', 'Ghanaian Cedi', 'GH₵', 'fiat', 2, '🇬🇭'),
    ('KES', 'Kenyan Shilling', 'KSh', 'fiat', 2, '🇰🇪'),
    ('ZAR', 'South African Rand', 'R', 'fiat', 2, '🇿🇦'),
    ('BTC', 'Bitcoin', '₿', 'crypto', 8, '🪙'),
    ('ETH', 'Ethereum', 'Ξ', 'crypto', 8, '💎'),
    ('USDT', 'Tether', '₮', 'crypto', 6, '💵'),
    ('USDC', 'USD Coin', 'USDC', 'crypto', 6, '💲'),
    ('SOL', 'Solana', 'SOL', 'crypto', 9, '☀️'),
    ('XRP', 'Ripple', 'XRP', 'crypto', 6, '💧'),
    ('BNB', 'Binance Coin', 'BNB', 'crypto', 8, '🔶'),
    ('ADA', 'Cardano', 'ADA', 'crypto', 6, '♠️'),
    ('DOGE', 'Dogecoin', 'Ð', 'crypto', 8, '🐕'),
    ('DOT', 'Polkadot', 'DOT', 'crypto', 10, '⚫'),
    ('MATIC', 'Polygon', 'MATIC', 'crypto', 18, '💜'),
    ('LTC', 'Litecoin', 'Ł', 'crypto', 8, '🔘'),
    ('AVAX', 'Avalanche', 'AVAX', 'crypto', 18, '🔺'),
    ('LINK', 'Chainlink', 'LINK', 'crypto', 18, '🔗'),
    ('UNI', 'Uniswap', 'UNI', 'crypto', 18, '🦄'),
    ('SHIB', 'Shiba Inu', 'SHIB', 'crypto', 18, '🐕‍🦺'),
    ('TRX', 'TRON', 'TRX', 'crypto', 6, '⚡'),
    ('ATOM', 'Cosmos', 'ATOM', 'crypto', 6, '⚛️')
ON CONFLICT (code) DO NOTHING;

-- Insert default crypto trading pairs
INSERT INTO public.crypto_pairs (base_currency, quote_currency, trading_fee_percent) VALUES
    ('BTC', 'USD', 0.01),
    ('BTC', 'USDT', 0.01),
    ('ETH', 'USD', 0.01),
    ('ETH', 'USDT', 0.01),
    ('SOL', 'USD', 0.01),
    ('SOL', 'USDT', 0.01),
    ('BNB', 'USD', 0.01),
    ('BNB', 'USDT', 0.01),
    ('XRP', 'USD', 0.01),
    ('XRP', 'USDT', 0.01),
    ('ADA', 'USD', 0.01),
    ('DOGE', 'USD', 0.01),
    ('DOT', 'USD', 0.01),
    ('MATIC', 'USD', 0.01),
    ('LTC', 'USD', 0.01),
    ('AVAX', 'USD', 0.01),
    ('LINK', 'USD', 0.01),
    ('UNI', 'USD', 0.01),
    ('SHIB', 'USD', 0.01),
    ('TRX', 'USD', 0.01),
    ('ATOM', 'USD', 0.01),
    ('USDT', 'USD', 0.001),
    ('USDC', 'USD', 0.001)
ON CONFLICT DO NOTHING;

-- Insert default compliance rules
INSERT INTO public.compliance_rules (rule_code, rule_name, rule_type, description, parameters, severity) VALUES
    ('VEL001', 'High Velocity Transfers', 'velocity', 'Detects unusual transaction frequency', '{"period_hours": 24, "max_transactions": 10}', 'medium'),
    ('AMT001', 'Large Amount Transfer', 'amount', 'Flags transfers above threshold', '{"threshold_usd": 10000}', 'high'),
    ('AMT002', 'Very Large Amount', 'amount', 'Flags very large transfers', '{"threshold_usd": 50000}', 'critical'),
    ('STR001', 'Structuring Detection', 'structuring', 'Detects potential structuring behavior', '{"threshold_usd": 10000, "window_hours": 24, "min_transactions": 3}', 'high')
ON CONFLICT DO NOTHING;

-- Insert default ledger accounts (Chart of Accounts)
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_system) VALUES
    ('1000', 'Assets', 'asset', NULL, true),
    ('1100', 'Cash and Cash Equivalents', 'asset', NULL, true),
    ('1110', 'Operating Bank Account - USD', 'asset', 'USD', true),
    ('1120', 'Operating Bank Account - CAD', 'asset', 'CAD', true),
    ('2000', 'Liabilities', 'liability', NULL, true),
    ('2100', 'Customer Liabilities', 'liability', NULL, true),
    ('2110', 'Customer Deposits - USD', 'liability', 'USD', true),
    ('2120', 'Customer Deposits - CAD', 'liability', 'CAD', true),
    ('3000', 'Equity', 'equity', NULL, true),
    ('4000', 'Revenue', 'income', NULL, true),
    ('4100', 'FX Revenue', 'income', NULL, true),
    ('4200', 'Trading Fees', 'income', NULL, true),
    ('4300', 'Transfer Fees', 'income', NULL, true),
    ('5000', 'Expenses', 'expense', NULL, true)
ON CONFLICT DO NOTHING;

-- Insert Canadian tax rates
INSERT INTO public.tax_rates (province_code, province_name, tax_type, rate) VALUES
    ('AB', 'Alberta', 'GST', 0.05),
    ('BC', 'British Columbia', 'GST', 0.05),
    ('BC', 'British Columbia', 'PST', 0.07),
    ('MB', 'Manitoba', 'GST', 0.05),
    ('MB', 'Manitoba', 'RST', 0.07),
    ('NB', 'New Brunswick', 'HST', 0.15),
    ('NL', 'Newfoundland and Labrador', 'HST', 0.15),
    ('NS', 'Nova Scotia', 'HST', 0.15),
    ('NT', 'Northwest Territories', 'GST', 0.05),
    ('NU', 'Nunavut', 'GST', 0.05),
    ('ON', 'Ontario', 'HST', 0.13),
    ('PE', 'Prince Edward Island', 'HST', 0.15),
    ('QC', 'Quebec', 'GST', 0.05),
    ('QC', 'Quebec', 'QST', 0.09975),
    ('SK', 'Saskatchewan', 'GST', 0.05),
    ('SK', 'Saskatchewan', 'PST', 0.06),
    ('YT', 'Yukon', 'GST', 0.05)
ON CONFLICT DO NOTHING;

-- Insert default onboarding steps
INSERT INTO public.onboarding_steps (name, description, step_order, is_required, requires_document, document_type) VALUES
    ('Company Information', 'Basic company details and registration', 1, true, false, NULL),
    ('Business Registration', 'Certificate of incorporation or business license', 2, true, true, 'business_registration'),
    ('Director/Owner ID', 'Government-issued ID for directors and beneficial owners', 3, true, true, 'government_id'),
    ('Proof of Address', 'Utility bill or bank statement for business address', 4, true, true, 'proof_of_address'),
    ('Banking Information', 'Bank account details for payments', 5, true, true, 'bank_statement'),
    ('Tax Documentation', 'Tax registration or W-9/W-8BEN', 6, false, true, 'tax_document'),
    ('AML Questionnaire', 'Anti-money laundering compliance questionnaire', 7, true, false, NULL)
ON CONFLICT DO NOTHING;

-- Insert sample FX rates
INSERT INTO public.fx_rates (from_currency, to_currency, rate, markup_rate, effective_rate) VALUES
    ('USD', 'CAD', 1.35, 0.02, 1.323),
    ('CAD', 'USD', 0.74, 0.02, 0.7252),
    ('USD', 'EUR', 0.92, 0.02, 0.9016),
    ('EUR', 'USD', 1.09, 0.02, 1.0682),
    ('USD', 'GBP', 0.79, 0.02, 0.7742),
    ('GBP', 'USD', 1.27, 0.02, 1.2446),
    ('USD', 'NGN', 1550, 0.03, 1503.5),
    ('NGN', 'USD', 0.000645, 0.03, 0.000626),
    ('USD', 'GHS', 15.5, 0.03, 15.035),
    ('USD', 'KES', 153, 0.03, 148.41),
    ('USD', 'ZAR', 18.5, 0.03, 17.945)
ON CONFLICT DO NOTHING;


-- ============================================================
-- SECTION 17: STORAGE BUCKETS
-- ============================================================

-- Create storage bucket for customer documents (run via Supabase dashboard or API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('customer-documents', 'customer-documents', false);


-- ============================================================
-- SETUP COMPLETE
-- ============================================================
-- 
-- After running this script:
-- 
-- 1. Create a trigger on auth.users via Supabase dashboard:
--    - Go to Database > Triggers
--    - Create trigger "on_auth_user_created" 
--    - Table: auth.users, Event: INSERT
--    - Function: public.handle_new_user()
--
-- 2. Configure authentication settings:
--    - Enable Email auth
--    - Enable auto-confirm for development
--
-- 3. Create the storage bucket:
--    - Go to Storage
--    - Create bucket "customer-documents" (private)
--
-- 4. Deploy edge functions from supabase/functions/
--
-- 5. Set environment variables if needed
--
-- ============================================================
