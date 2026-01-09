-- =============================================================
-- FLOWPAY: Phase 2 - FX Engine, Crypto, Bank Recon, Compliance
-- =============================================================

-- 1. NEW ENUMS
CREATE TYPE public.trade_side AS ENUM ('buy', 'sell');
CREATE TYPE public.trade_status AS ENUM ('pending', 'executed', 'cancelled', 'failed');
CREATE TYPE public.reconciliation_status AS ENUM ('pending', 'matched', 'unmatched', 'exception', 'resolved');
CREATE TYPE public.alert_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.alert_status AS ENUM ('open', 'investigating', 'escalated', 'resolved', 'false_positive');

-- 2. FX TRANSACTIONS TABLE (Currency Swaps)
CREATE TABLE public.fx_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    from_wallet_id UUID NOT NULL REFERENCES public.wallets(id),
    to_wallet_id UUID NOT NULL REFERENCES public.wallets(id),
    from_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    to_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    from_amount DECIMAL(20, 8) NOT NULL,
    to_amount DECIMAL(20, 8) NOT NULL,
    market_rate DECIMAL(20, 8) NOT NULL,
    markup_rate DECIMAL(20, 8) NOT NULL DEFAULT 0,
    effective_rate DECIMAL(20, 8) NOT NULL,
    fee_amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
    rate_locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rate_expires_at TIMESTAMPTZ NOT NULL,
    status public.trade_status NOT NULL DEFAULT 'pending',
    journal_id UUID,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. CRYPTO TRADING PAIRS
CREATE TABLE public.crypto_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    quote_currency VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    min_trade_amount DECIMAL(20, 8) NOT NULL DEFAULT 1,
    max_trade_amount DECIMAL(20, 8),
    is_active BOOLEAN NOT NULL DEFAULT true,
    trading_fee_percent DECIMAL(5, 4) NOT NULL DEFAULT 0.0025,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (base_currency, quote_currency)
);

-- Insert default crypto pairs
INSERT INTO public.crypto_pairs (base_currency, quote_currency, min_trade_amount, trading_fee_percent) VALUES
    ('USDT', 'USD', 10, 0.0025),
    ('USDC', 'USD', 10, 0.0025),
    ('BTC', 'USD', 0.0001, 0.0035),
    ('BTC', 'USDT', 0.0001, 0.0030);

-- 4. CRYPTO TRADES TABLE
CREATE TABLE public.crypto_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    pair_id UUID NOT NULL REFERENCES public.crypto_pairs(id),
    side public.trade_side NOT NULL,
    base_wallet_id UUID REFERENCES public.wallets(id),
    quote_wallet_id UUID REFERENCES public.wallets(id),
    base_amount DECIMAL(20, 8) NOT NULL,
    quote_amount DECIMAL(20, 8) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    fee_amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
    fee_currency VARCHAR(10) REFERENCES public.currencies(code),
    status public.trade_status NOT NULL DEFAULT 'pending',
    journal_id UUID,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. BANK ACCOUNTS TABLE
CREATE TABLE public.bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_name VARCHAR(255) NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    routing_number VARCHAR(50),
    swift_code VARCHAR(20),
    currency_code VARCHAR(10) NOT NULL REFERENCES public.currencies(code),
    account_type VARCHAR(50) NOT NULL DEFAULT 'trust',
    ledger_account_id UUID REFERENCES public.ledger_accounts(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_reconciled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. BANK TRANSACTIONS TABLE (imported from banks)
CREATE TABLE public.bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id),
    transaction_date DATE NOT NULL,
    post_date DATE,
    description TEXT NOT NULL,
    reference VARCHAR(255),
    debit_amount DECIMAL(20, 8) DEFAULT 0,
    credit_amount DECIMAL(20, 8) DEFAULT 0,
    balance DECIMAL(20, 8),
    category VARCHAR(100),
    raw_data JSONB,
    import_batch_id UUID,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. RECONCILIATION RECORDS
CREATE TABLE public.reconciliation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_transaction_id UUID REFERENCES public.bank_transactions(id),
    ledger_entry_id UUID REFERENCES public.ledger_entries(id),
    transfer_id UUID REFERENCES public.transfers(id),
    matched_amount DECIMAL(20, 8),
    status public.reconciliation_status NOT NULL DEFAULT 'pending',
    match_confidence DECIMAL(5, 2),
    match_reason TEXT,
    exception_reason TEXT,
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. COMPLIANCE RULES TABLE
CREATE TABLE public.compliance_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_code VARCHAR(50) NOT NULL UNIQUE,
    rule_name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50) NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}',
    severity public.alert_severity NOT NULL DEFAULT 'medium',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default compliance rules
INSERT INTO public.compliance_rules (rule_code, rule_name, rule_type, parameters, severity) VALUES
    ('VEL_DAILY', 'Daily Velocity Check', 'velocity', '{"max_transactions": 10, "period_hours": 24}', 'medium'),
    ('VEL_AMOUNT', 'Large Transaction Alert', 'amount', '{"threshold_usd": 3000}', 'high'),
    ('STRUCT', 'Structuring Detection', 'structuring', '{"threshold_usd": 10000, "window_hours": 24, "min_transactions": 3}', 'critical'),
    ('HIGH_RISK', 'High Risk Corridor', 'corridor', '{"corridors": ["US-NG", "CA-NG"]}', 'high'),
    ('NEW_RECIP', 'New Recipient Large Transfer', 'recipient', '{"threshold_usd": 1000, "account_age_days": 7}', 'medium');

-- 9. COMPLIANCE ALERTS TABLE
CREATE TABLE public.compliance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    rule_id UUID NOT NULL REFERENCES public.compliance_rules(id),
    transfer_id UUID REFERENCES public.transfers(id),
    severity public.alert_severity NOT NULL,
    status public.alert_status NOT NULL DEFAULT 'open',
    alert_data JSONB NOT NULL DEFAULT '{}',
    notes TEXT,
    assigned_to UUID REFERENCES auth.users(id),
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. COMPLIANCE REPORTS (for FinCEN/FINTRAC)
CREATE TABLE public.compliance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(50) NOT NULL,
    reporting_period_start DATE NOT NULL,
    reporting_period_end DATE NOT NULL,
    jurisdiction VARCHAR(10) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    report_data JSONB NOT NULL DEFAULT '{}',
    filed_at TIMESTAMPTZ,
    filed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- RLS POLICIES
-- =============================================================

ALTER TABLE public.fx_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_reports ENABLE ROW LEVEL SECURITY;

-- FX Transactions: Users see own, finance sees all
CREATE POLICY "Users can view own fx transactions" ON public.fx_transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create fx transactions" ON public.fx_transactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Finance can view all fx transactions" ON public.fx_transactions
    FOR SELECT USING (public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'admin'));

-- Crypto pairs: Public read
CREATE POLICY "Crypto pairs are publicly readable" ON public.crypto_pairs
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage crypto pairs" ON public.crypto_pairs
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Crypto trades: Users see own
CREATE POLICY "Users can view own crypto trades" ON public.crypto_trades
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create crypto trades" ON public.crypto_trades
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Finance can view all crypto trades" ON public.crypto_trades
    FOR SELECT USING (public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'admin'));

-- Bank accounts: Finance/admin only
CREATE POLICY "Finance can view bank accounts" ON public.bank_accounts
    FOR SELECT USING (public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage bank accounts" ON public.bank_accounts
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Bank transactions: Finance only
CREATE POLICY "Finance can view bank transactions" ON public.bank_transactions
    FOR SELECT USING (public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Finance can insert bank transactions" ON public.bank_transactions
    FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'admin'));

-- Reconciliation: Finance only
CREATE POLICY "Finance can view reconciliation" ON public.reconciliation_records
    FOR SELECT USING (public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Finance can manage reconciliation" ON public.reconciliation_records
    FOR ALL USING (public.has_role(auth.uid(), 'finance') OR public.has_role(auth.uid(), 'admin'));

-- Compliance rules: Read by compliance/admin
CREATE POLICY "Compliance can view rules" ON public.compliance_rules
    FOR SELECT USING (public.has_role(auth.uid(), 'compliance') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage compliance rules" ON public.compliance_rules
    FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Compliance alerts: Compliance/admin
CREATE POLICY "Compliance can view alerts" ON public.compliance_alerts
    FOR SELECT USING (public.has_role(auth.uid(), 'compliance') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Compliance can manage alerts" ON public.compliance_alerts
    FOR ALL USING (public.has_role(auth.uid(), 'compliance') OR public.has_role(auth.uid(), 'admin'));

-- Compliance reports: Compliance/admin
CREATE POLICY "Compliance can view reports" ON public.compliance_reports
    FOR SELECT USING (public.has_role(auth.uid(), 'compliance') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Compliance can manage reports" ON public.compliance_reports
    FOR ALL USING (public.has_role(auth.uid(), 'compliance') OR public.has_role(auth.uid(), 'admin'));

-- =============================================================
-- FUNCTIONS FOR FX & TRADING
-- =============================================================

-- Function to execute FX swap with ledger entries
CREATE OR REPLACE FUNCTION public.execute_fx_swap(
    p_user_id UUID,
    p_from_wallet_id UUID,
    p_to_wallet_id UUID,
    p_from_amount DECIMAL,
    p_effective_rate DECIMAL,
    p_fee_amount DECIMAL DEFAULT 0
)
RETURNS UUID
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
BEGIN
    -- Get wallet currencies
    SELECT currency_code INTO v_from_currency FROM wallets WHERE id = p_from_wallet_id;
    SELECT currency_code INTO v_to_currency FROM wallets WHERE id = p_to_wallet_id;
    
    -- Calculate to amount
    v_to_amount := (p_from_amount - p_fee_amount) * p_effective_rate;
    
    -- Get ledger accounts
    SELECT id INTO v_from_liability_account FROM ledger_accounts 
        WHERE code LIKE '21%' AND currency_code = v_from_currency LIMIT 1;
    SELECT id INTO v_to_liability_account FROM ledger_accounts 
        WHERE code LIKE '21%' AND currency_code = v_to_currency LIMIT 1;
    SELECT id INTO v_fx_revenue_account FROM ledger_accounts WHERE code = '4100';
    
    -- Debit from wallet (reduce liability to customer in from_currency)
    INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
    VALUES (v_journal_id, v_from_liability_account, p_from_wallet_id, v_from_currency, p_from_amount, 0, 'FX Swap - Debit', 'fx', p_user_id);
    
    -- Credit to wallet (increase liability to customer in to_currency)
    INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
    VALUES (v_journal_id, v_to_liability_account, p_to_wallet_id, v_to_currency, 0, v_to_amount, 'FX Swap - Credit', 'fx', p_user_id);
    
    -- Record FX revenue (fee)
    IF p_fee_amount > 0 THEN
        INSERT INTO ledger_entries (journal_id, account_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, created_by)
        VALUES (v_journal_id, v_fx_revenue_account, NULL, v_from_currency, 0, p_fee_amount, 'FX Fee Revenue', 'fx', p_user_id);
    END IF;
    
    RETURN v_journal_id;
END;
$$;

-- Function to run compliance checks on a transfer
CREATE OR REPLACE FUNCTION public.run_compliance_checks(p_transfer_id UUID)
RETURNS INTEGER
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
    -- Get transfer details
    SELECT * INTO v_transfer FROM transfers WHERE id = p_transfer_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Check each active rule
    FOR v_rule IN SELECT * FROM compliance_rules WHERE is_active = true LOOP
        
        -- Velocity check (daily transaction count)
        IF v_rule.rule_type = 'velocity' THEN
            SELECT COUNT(*) INTO v_daily_count
            FROM transfers
            WHERE sender_id = v_transfer.sender_id
              AND created_at > now() - ((v_rule.parameters->>'period_hours')::int * interval '1 hour');
            
            IF v_daily_count > (v_rule.parameters->>'max_transactions')::int THEN
                INSERT INTO compliance_alerts (user_id, rule_id, transfer_id, severity, alert_data)
                VALUES (v_transfer.sender_id, v_rule.id, p_transfer_id, v_rule.severity, 
                    jsonb_build_object('daily_count', v_daily_count, 'threshold', v_rule.parameters->>'max_transactions'));
                v_alert_count := v_alert_count + 1;
            END IF;
        END IF;
        
        -- Large amount check
        IF v_rule.rule_type = 'amount' THEN
            IF v_transfer.source_amount > (v_rule.parameters->>'threshold_usd')::decimal THEN
                INSERT INTO compliance_alerts (user_id, rule_id, transfer_id, severity, alert_data)
                VALUES (v_transfer.sender_id, v_rule.id, p_transfer_id, v_rule.severity,
                    jsonb_build_object('amount', v_transfer.source_amount, 'threshold', v_rule.parameters->>'threshold_usd'));
                v_alert_count := v_alert_count + 1;
            END IF;
        END IF;
        
        -- Structuring detection
        IF v_rule.rule_type = 'structuring' THEN
            SELECT COUNT(*), COALESCE(SUM(source_amount), 0) INTO v_daily_count, v_daily_amount
            FROM transfers
            WHERE sender_id = v_transfer.sender_id
              AND created_at > now() - ((v_rule.parameters->>'window_hours')::int * interval '1 hour')
              AND source_amount < (v_rule.parameters->>'threshold_usd')::decimal;
            
            IF v_daily_count >= (v_rule.parameters->>'min_transactions')::int 
               AND v_daily_amount >= (v_rule.parameters->>'threshold_usd')::decimal THEN
                INSERT INTO compliance_alerts (user_id, rule_id, transfer_id, severity, alert_data)
                VALUES (v_transfer.sender_id, v_rule.id, p_transfer_id, v_rule.severity,
                    jsonb_build_object('transaction_count', v_daily_count, 'total_amount', v_daily_amount));
                v_alert_count := v_alert_count + 1;
            END IF;
        END IF;
        
    END LOOP;
    
    RETURN v_alert_count;
END;
$$;

-- Trigger to run compliance checks on new transfers
CREATE OR REPLACE FUNCTION public.trigger_compliance_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.run_compliance_checks(NEW.id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER check_transfer_compliance
    AFTER INSERT ON public.transfers
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_compliance_check();