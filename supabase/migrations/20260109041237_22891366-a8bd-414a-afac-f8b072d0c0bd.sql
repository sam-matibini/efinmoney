-- Create rate_limits table for edge function rate limiting
CREATE TABLE public.rate_limits (
    key VARCHAR(255) PRIMARY KEY,
    count INT NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for cleanup of expired records
CREATE INDEX idx_rate_limits_expires ON public.rate_limits(expires_at);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can access rate limits (edge functions use service role for this)
CREATE POLICY "Service role only" ON public.rate_limits
    FOR ALL USING (false);

-- Create function to check and increment rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key VARCHAR(255),
    p_max_requests INT,
    p_window_seconds INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Clean up expired entries (opportunistic cleanup)
    DELETE FROM rate_limits WHERE expires_at < now();
    
    -- Check current count for the key
    SELECT count, expires_at INTO v_count, v_expires_at
    FROM rate_limits
    WHERE key = p_key AND expires_at > now();
    
    IF v_count IS NULL THEN
        -- First request in window, create entry
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
        -- Rate limit exceeded
        RETURN FALSE;
    ELSE
        -- Increment count
        UPDATE rate_limits SET count = count + 1 WHERE key = p_key;
        RETURN TRUE;
    END IF;
END;
$$;

-- Create validation function for compliance rule parameters
CREATE OR REPLACE FUNCTION public.validate_compliance_parameters(
    p_rule_type VARCHAR,
    p_parameters JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_period_hours INT;
    v_max_transactions INT;
    v_threshold_usd DECIMAL;
    v_window_hours INT;
    v_min_transactions INT;
BEGIN
    IF p_rule_type = 'velocity' THEN
        -- Validate required keys exist
        IF NOT (p_parameters ? 'period_hours' AND p_parameters ? 'max_transactions') THEN
            RAISE EXCEPTION 'Velocity rule requires period_hours and max_transactions';
        END IF;
        
        -- Validate types and ranges with safe extraction
        BEGIN
            v_period_hours := (p_parameters->>'period_hours')::int;
            v_max_transactions := (p_parameters->>'max_transactions')::int;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid numeric value in velocity rule parameters';
        END;
        
        IF v_period_hours < 1 OR v_period_hours > 720 THEN
            RAISE EXCEPTION 'period_hours must be between 1 and 720';
        END IF;
        
        IF v_max_transactions < 1 OR v_max_transactions > 10000 THEN
            RAISE EXCEPTION 'max_transactions must be between 1 and 10000';
        END IF;
        
    ELSIF p_rule_type = 'amount' THEN
        IF NOT (p_parameters ? 'threshold_usd') THEN
            RAISE EXCEPTION 'Amount rule requires threshold_usd';
        END IF;
        
        BEGIN
            v_threshold_usd := (p_parameters->>'threshold_usd')::decimal;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid numeric value for threshold_usd';
        END;
        
        IF v_threshold_usd < 0 OR v_threshold_usd > 10000000 THEN
            RAISE EXCEPTION 'threshold_usd must be between 0 and 10000000';
        END IF;
        
    ELSIF p_rule_type = 'structuring' THEN
        IF NOT (p_parameters ? 'threshold_usd' AND p_parameters ? 'window_hours' AND p_parameters ? 'min_transactions') THEN
            RAISE EXCEPTION 'Structuring rule requires threshold_usd, window_hours, and min_transactions';
        END IF;
        
        BEGIN
            v_threshold_usd := (p_parameters->>'threshold_usd')::decimal;
            v_window_hours := (p_parameters->>'window_hours')::int;
            v_min_transactions := (p_parameters->>'min_transactions')::int;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid numeric value in structuring rule parameters';
        END;
        
        IF v_threshold_usd < 0 OR v_threshold_usd > 10000000 THEN
            RAISE EXCEPTION 'threshold_usd must be between 0 and 10000000';
        END IF;
        
        IF v_window_hours < 1 OR v_window_hours > 720 THEN
            RAISE EXCEPTION 'window_hours must be between 1 and 720';
        END IF;
        
        IF v_min_transactions < 1 OR v_min_transactions > 1000 THEN
            RAISE EXCEPTION 'min_transactions must be between 1 and 1000';
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$$;

-- Update run_compliance_checks with safe parameter extraction
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
    v_period_hours INT;
    v_max_transactions INT;
    v_threshold_usd DECIMAL;
    v_window_hours INT;
    v_min_transactions INT;
BEGIN
    -- Get transfer details
    SELECT * INTO v_transfer FROM transfers WHERE id = p_transfer_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Check each active rule
    FOR v_rule IN SELECT * FROM compliance_rules WHERE is_active = true LOOP
        BEGIN -- Error handling block for each rule
            -- Velocity check (daily transaction count)
            IF v_rule.rule_type = 'velocity' THEN
                -- Safe extraction with validation
                v_period_hours := COALESCE((v_rule.parameters->>'period_hours')::int, 24);
                v_max_transactions := COALESCE((v_rule.parameters->>'max_transactions')::int, 10);
                
                -- Bounds checking
                IF v_period_hours < 1 OR v_period_hours > 720 THEN
                    RAISE WARNING 'Invalid period_hours in rule %: %, skipping', v_rule.id, v_period_hours;
                    CONTINUE;
                END IF;
                
                IF v_max_transactions < 1 OR v_max_transactions > 10000 THEN
                    RAISE WARNING 'Invalid max_transactions in rule %: %, skipping', v_rule.id, v_max_transactions;
                    CONTINUE;
                END IF;
                
                SELECT COUNT(*) INTO v_daily_count
                FROM transfers
                WHERE sender_id = v_transfer.sender_id
                  AND created_at > now() - (v_period_hours * interval '1 hour');
                
                IF v_daily_count > v_max_transactions THEN
                    INSERT INTO compliance_alerts (user_id, rule_id, transfer_id, severity, alert_data)
                    VALUES (v_transfer.sender_id, v_rule.id, p_transfer_id, v_rule.severity, 
                        jsonb_build_object('daily_count', v_daily_count, 'threshold', v_max_transactions));
                    v_alert_count := v_alert_count + 1;
                END IF;
            END IF;
            
            -- Large amount check
            IF v_rule.rule_type = 'amount' THEN
                v_threshold_usd := COALESCE((v_rule.parameters->>'threshold_usd')::decimal, 10000);
                
                -- Bounds checking
                IF v_threshold_usd < 0 OR v_threshold_usd > 10000000 THEN
                    RAISE WARNING 'Invalid threshold_usd in rule %: %, skipping', v_rule.id, v_threshold_usd;
                    CONTINUE;
                END IF;
                
                IF v_transfer.source_amount > v_threshold_usd THEN
                    INSERT INTO compliance_alerts (user_id, rule_id, transfer_id, severity, alert_data)
                    VALUES (v_transfer.sender_id, v_rule.id, p_transfer_id, v_rule.severity,
                        jsonb_build_object('amount', v_transfer.source_amount, 'threshold', v_threshold_usd));
                    v_alert_count := v_alert_count + 1;
                END IF;
            END IF;
            
            -- Structuring detection
            IF v_rule.rule_type = 'structuring' THEN
                v_window_hours := COALESCE((v_rule.parameters->>'window_hours')::int, 24);
                v_min_transactions := COALESCE((v_rule.parameters->>'min_transactions')::int, 3);
                v_threshold_usd := COALESCE((v_rule.parameters->>'threshold_usd')::decimal, 10000);
                
                -- Bounds checking
                IF v_window_hours < 1 OR v_window_hours > 720 THEN
                    RAISE WARNING 'Invalid window_hours in rule %: %, skipping', v_rule.id, v_window_hours;
                    CONTINUE;
                END IF;
                
                IF v_min_transactions < 1 OR v_min_transactions > 1000 THEN
                    RAISE WARNING 'Invalid min_transactions in rule %: %, skipping', v_rule.id, v_min_transactions;
                    CONTINUE;
                END IF;
                
                IF v_threshold_usd < 0 OR v_threshold_usd > 10000000 THEN
                    RAISE WARNING 'Invalid threshold_usd in rule %: %, skipping', v_rule.id, v_threshold_usd;
                    CONTINUE;
                END IF;
                
                SELECT COUNT(*), COALESCE(SUM(source_amount), 0) INTO v_daily_count, v_daily_amount
                FROM transfers
                WHERE sender_id = v_transfer.sender_id
                  AND created_at > now() - (v_window_hours * interval '1 hour')
                  AND source_amount < v_threshold_usd;
                
                IF v_daily_count >= v_min_transactions 
                   AND v_daily_amount >= v_threshold_usd THEN
                    INSERT INTO compliance_alerts (user_id, rule_id, transfer_id, severity, alert_data)
                    VALUES (v_transfer.sender_id, v_rule.id, p_transfer_id, v_rule.severity,
                        jsonb_build_object('transaction_count', v_daily_count, 'total_amount', v_daily_amount));
                    v_alert_count := v_alert_count + 1;
                END IF;
            END IF;
            
        EXCEPTION
            WHEN OTHERS THEN
                -- Log error and continue with next rule
                RAISE WARNING 'Error processing compliance rule %: %', v_rule.id, SQLERRM;
                CONTINUE;
        END;
    END LOOP;
    
    RETURN v_alert_count;
END;
$$;