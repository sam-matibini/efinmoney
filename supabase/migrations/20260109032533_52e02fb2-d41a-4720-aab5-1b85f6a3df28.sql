-- =============================================================
-- FLOWPAY: Mobile Money Platform - Phase 1 Database Schema
-- Core: Users, Wallets, Chart of Accounts, Double-Entry Ledger
-- =============================================================

-- 1. ENUMS
-- ---------
CREATE TYPE public.kyc_status AS ENUM ('pending', 'submitted', 'verified', 'rejected', 'expired');
CREATE TYPE public.kyc_tier AS ENUM ('tier_0', 'tier_1', 'tier_2', 'tier_3');
CREATE TYPE public.app_role AS ENUM ('user', 'admin', 'compliance', 'support', 'finance');
CREATE TYPE public.account_type AS ENUM ('asset', 'liability', 'income', 'expense', 'equity');
CREATE TYPE public.currency_type AS ENUM ('fiat', 'crypto');
CREATE TYPE public.wallet_status AS ENUM ('active', 'frozen', 'suspended', 'closed');
CREATE TYPE public.transfer_status AS ENUM ('initiated', 'funded', 'processing', 'completed', 'failed', 'reversed', 'expired');
CREATE TYPE public.transfer_type AS ENUM ('internal', 'mobile_money', 'bank', 'crypto');

-- 2. CURRENCIES TABLE
-- -------------------
CREATE TABLE public.currencies (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    currency_type public.currency_type NOT NULL DEFAULT 'fiat',
    decimal_places INT NOT NULL DEFAULT 2,
    is_active BOOLEAN NOT NULL DEFAULT true,
    flag_emoji VARCHAR(10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default currencies
INSERT INTO public.currencies (code, name, symbol, currency_type, decimal_places, flag_emoji) VALUES
    ('USD', 'US Dollar', '$', 'fiat', 2, '🇺🇸'),
    ('CAD', 'Canadian Dollar', 'C$', 'fiat', 2, '🇨🇦'),
    ('KES', 'Kenyan Shilling', 'KSh', 'fiat', 2, '🇰🇪'),
    ('UGX', 'Ugandan Shilling', 'USh', 'fiat', 0, '🇺🇬'),
    ('TZS', 'Tanzanian Shilling', 'TSh', 'fiat', 2, '🇹🇿'),
    ('ZMW', 'Zambian Kwacha', 'ZK', 'fiat', 2, '🇿🇲'),
    ('BIF', 'Burundian Franc', 'FBu', 'fiat', 0, '🇧🇮'),
    ('USDT', 'Tether USD', '₮', 'crypto', 6, '₿'),
    ('USDC', 'USD Coin', 'USDC', 'crypto', 6, '₿'),
    ('BTC', 'Bitcoin', '₿', 'crypto', 8, '₿');

-- 3. PROFILES TABLE (User Profiles)
-- ----------------------------------
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255),
    full_name VARCHAR(255),
    phone_number VARCHAR(50),
    country_code VARCHAR(3),
    kyc_status public.kyc_status NOT NULL DEFAULT 'pending',
    kyc_tier public.kyc_tier NOT NULL DEFAULT 'tier_0',
    risk_score INT DEFAULT 0,
    default_currency VARCHAR(10) REFERENCES public.currencies(code) DEFAULT 'USD',
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. USER ROLES TABLE (Separate from profiles for security)
-- ---------------------------------------------------------
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.app_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- 5. CHART OF ACCOUNTS (COA) - Double Entry Accounting
-- -----------------------------------------------------
CREATE TABLE public.ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    account_type public.account_type NOT NULL,
    currency_code VARCHAR(10) REFERENCES public.currencies(code),
    parent_id UUID REFERENCES public.ledger_accounts(id),
    is_system BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert Chart of Accounts
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_system) VALUES
    -- Assets
    ('1000', 'Assets', 'asset', NULL, true),
    ('1100', 'Bank Trust - USD', 'asset', 'USD', true),
    ('1101', 'Bank Trust - CAD', 'asset', 'CAD', true),
    ('1110', 'Bank Trust - KES', 'asset', 'KES', true),
    ('1111', 'Bank Trust - UGX', 'asset', 'UGX', true),
    ('1112', 'Bank Trust - TZS', 'asset', 'TZS', true),
    ('1200', 'Customer Wallet Clearing - USD', 'asset', 'USD', true),
    ('1201', 'Customer Wallet Clearing - CAD', 'asset', 'CAD', true),
    ('1300', 'FX Liquidity', 'asset', NULL, true),
    ('1400', 'Crypto Custody Wallets', 'asset', NULL, true),
    ('1500', 'Fixed Assets', 'asset', NULL, true),
    -- Liabilities
    ('2000', 'Liabilities', 'liability', NULL, true),
    ('2100', 'Customer Wallet Liability - USD', 'liability', 'USD', true),
    ('2101', 'Customer Wallet Liability - CAD', 'liability', 'CAD', true),
    ('2110', 'Customer Wallet Liability - KES', 'liability', 'KES', true),
    ('2111', 'Customer Wallet Liability - UGX', 'liability', 'UGX', true),
    ('2200', 'Pending Transfers', 'liability', NULL, true),
    ('2300', 'Crypto Custody Liability', 'liability', NULL, true),
    -- Income
    ('4000', 'Income', 'income', NULL, true),
    ('4100', 'FX Gain', 'income', NULL, true),
    ('4200', 'Transfer Fees', 'income', NULL, true),
    ('4300', 'Crypto Trading Fees', 'income', NULL, true),
    -- Expenses
    ('5000', 'Expenses', 'expense', NULL, true),
    ('5100', 'FX Loss', 'expense', NULL, true),
    ('5200', 'Provider Fees', 'expense', NULL, true),
    ('5300', 'Network Fees', 'expense', NULL, true),
    ('5400', 'Depreciation Expense', 'expense', NULL, true);

-- 6. USER WALLETS
-- ---------------
CREATE TABLE public.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    currency_code VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    status public.wallet_status NOT NULL DEFAULT 'active',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, currency_code)
);

-- 7. LEDGER ENTRIES (Immutable Double-Entry Transactions)
-- --------------------------------------------------------
CREATE TABLE public.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id UUID NOT NULL, -- Groups related entries
    account_id UUID NOT NULL REFERENCES public.ledger_accounts(id),
    wallet_id UUID REFERENCES public.wallets(id),
    currency_code VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    debit_amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
    credit_amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
    description TEXT,
    reference_type VARCHAR(50), -- 'transfer', 'fx', 'deposit', 'fee', etc.
    reference_id UUID, -- Link to specific transaction
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    CONSTRAINT valid_entry CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR 
        (credit_amount > 0 AND debit_amount = 0)
    )
);

-- 8. TRANSFERS TABLE
-- ------------------
CREATE TABLE public.transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES auth.users(id),
    sender_wallet_id UUID NOT NULL REFERENCES public.wallets(id),
    recipient_name VARCHAR(255) NOT NULL,
    recipient_phone VARCHAR(50),
    recipient_account VARCHAR(100),
    recipient_country VARCHAR(3) NOT NULL,
    transfer_type public.transfer_type NOT NULL,
    payout_method VARCHAR(50), -- 'mpesa', 'mtn_mobile', 'bank_transfer', etc.
    source_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    target_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    source_amount DECIMAL(20, 8) NOT NULL,
    target_amount DECIMAL(20, 8) NOT NULL,
    exchange_rate DECIMAL(20, 8) NOT NULL DEFAULT 1,
    fee_amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
    status public.transfer_status NOT NULL DEFAULT 'initiated',
    provider_reference VARCHAR(255),
    failure_reason TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. FX RATES TABLE
-- -----------------
CREATE TABLE public.fx_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    to_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    rate DECIMAL(20, 8) NOT NULL,
    markup_rate DECIMAL(20, 8) NOT NULL DEFAULT 0,
    effective_rate DECIMAL(20, 8) NOT NULL,
    source VARCHAR(50) DEFAULT 'manual',
    valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_currency, to_currency, valid_from)
);

-- Insert default FX rates
INSERT INTO public.fx_rates (from_currency, to_currency, rate, markup_rate, effective_rate) VALUES
    ('USD', 'KES', 153.00, 0.45, 153.45),
    ('USD', 'UGX', 3730.00, 12.50, 3742.50),
    ('USD', 'TZS', 2495.00, 10.00, 2505.00),
    ('USD', 'ZMW', 26.50, 0.35, 26.85),
    ('USD', 'BIF', 2840.00, 10.00, 2850.00),
    ('CAD', 'USD', 0.735, 0.005, 0.74);

-- 10. AUDIT LOG
-- -------------
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- SECURITY: Row Level Security Policies
-- =============================================================

-- Enable RLS on all tables
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = _role
    )
$$;

-- Currencies: Public read, admin write
CREATE POLICY "Currencies are publicly readable" ON public.currencies
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage currencies" ON public.currencies
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Profiles: Users can read/update own, admins can read all
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- User Roles: Only admins can manage
CREATE POLICY "Admins can view all roles" ON public.user_roles
    FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" ON public.user_roles
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Ledger Accounts: Public read for reference, admin write
CREATE POLICY "Ledger accounts are readable by authenticated" ON public.ledger_accounts
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage ledger accounts" ON public.ledger_accounts
    FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

-- Wallets: Users can manage own wallets
CREATE POLICY "Users can view own wallets" ON public.wallets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own wallets" ON public.wallets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wallets" ON public.wallets
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all wallets" ON public.wallets
    FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Ledger Entries: Users can view entries for their wallets, finance can view all
CREATE POLICY "Users can view own ledger entries" ON public.ledger_entries
    FOR SELECT USING (
        wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid())
        OR public.has_role(auth.uid(), 'finance')
        OR public.has_role(auth.uid(), 'admin')
    );

CREATE POLICY "System can insert ledger entries" ON public.ledger_entries
    FOR INSERT WITH CHECK (true);

-- Transfers: Users can manage own transfers
CREATE POLICY "Users can view own transfers" ON public.transfers
    FOR SELECT USING (auth.uid() = sender_id);

CREATE POLICY "Users can create transfers" ON public.transfers
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update own transfers" ON public.transfers
    FOR UPDATE USING (auth.uid() = sender_id);

CREATE POLICY "Admins can view all transfers" ON public.transfers
    FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compliance'));

-- FX Rates: Public read
CREATE POLICY "FX rates are publicly readable" ON public.fx_rates
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage FX rates" ON public.fx_rates
    FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'));

-- Audit Logs: Only admins and compliance
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
    FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'compliance'));

CREATE POLICY "System can insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (true);

-- =============================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at
    BEFORE UPDATE ON public.wallets
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transfers_updated_at
    BEFORE UPDATE ON public.transfers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email)
    VALUES (NEW.id, NEW.email);
    
    -- Create default wallets
    INSERT INTO public.wallets (user_id, currency_code, is_default) VALUES
        (NEW.id, 'USD', true),
        (NEW.id, 'CAD', false);
    
    -- Assign default user role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to calculate wallet balance from ledger
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_wallet_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    balance DECIMAL(20, 8);
BEGIN
    SELECT COALESCE(SUM(credit_amount) - SUM(debit_amount), 0)
    INTO balance
    FROM public.ledger_entries
    WHERE wallet_id = p_wallet_id;
    
    RETURN balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to get wallet balance with currency
CREATE OR REPLACE FUNCTION public.get_user_wallet_balances(p_user_id UUID)
RETURNS TABLE (
    wallet_id UUID,
    currency_code VARCHAR(10),
    currency_name VARCHAR(100),
    symbol VARCHAR(10),
    flag_emoji VARCHAR(10),
    balance DECIMAL(20, 8),
    status public.wallet_status
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.id as wallet_id,
        w.currency_code,
        c.name as currency_name,
        c.symbol,
        c.flag_emoji,
        public.get_wallet_balance(w.id) as balance,
        w.status
    FROM public.wallets w
    JOIN public.currencies c ON w.currency_code = c.code
    WHERE w.user_id = p_user_id
    ORDER BY w.is_default DESC, c.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;