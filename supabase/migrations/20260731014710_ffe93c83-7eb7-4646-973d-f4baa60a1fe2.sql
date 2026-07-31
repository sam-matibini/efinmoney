-- =========================================================
-- 1. Seed the single customer rate card (efinmoney_pricing)
--    '*' means "any currency". Values mirror what is currently
--    hardcoded in the app so no customer price changes.
-- =========================================================
INSERT INTO public.efinmoney_pricing
  (customer_type, direction, source_currency, dest_currency, dest_country, payment_method,
   fixed_fee, percentage_fee, fx_margin_bps, min_fee, max_fee)
VALUES
  -- Global default transfer fee (was pricing_config.transfer_base_fee = 0.30)
  ('consumer', 'payout', '*',   '*',    NULL, NULL,             0.30, 0, 0, NULL, NULL),
  -- Canadian domestic delivery methods (was DELIVERY_FEES in CanadaSendFlow)
  ('consumer', 'payout', 'CAD', 'CAD',  'CA', 'interac',        0.50, 0, 0, NULL, NULL),
  ('consumer', 'payout', 'CAD', 'CAD',  'CA', 'eft',            0.00, 0, 0, NULL, NULL),
  ('consumer', 'payout', 'CAD', 'CAD',  'CA', 'card_push',      1.00, 0, 0, NULL, NULL),
  ('consumer', 'payout', 'CAD', 'CAD',  'CA', 'stripe_connect', 1.00, 0, 0, NULL, NULL),
  ('consumer', 'payout', 'CAD', 'CAD',  'CA', 'paylink',        0.00, 0, 0, NULL, NULL),
  -- Card funding surcharge (was CARD_PROCESSING_FEE = 1.50)
  ('consumer', 'payin',  '*',   '*',    NULL, 'card',           1.50, 0, 0, NULL, NULL),
  ('consumer', 'payin',  '*',   '*',    NULL, NULL,             0.00, 0, 0, NULL, NULL),
  -- Crypto swap spread (was FEE_BPS = 50)
  ('consumer', 'payout', '*',   'USDC', NULL, 'crypto_swap',    0.00, 0.50, 0, NULL, NULL),
  -- Wallet-to-wallet FX swap fee (was fee_rate = 0.005 in fx-engine)
  ('consumer', 'payout', '*',   '*',    NULL, 'fx_swap',        0.00, 0.50, 0, NULL, NULL);

-- Retire the legacy global fee knobs
UPDATE public.pricing_config
   SET description = '[DEPRECATED — superseded by the eFinMoney rate card] ' || COALESCE(description, '')
 WHERE key IN ('transfer_base_fee', 'transfer_card_surcharge');

-- =========================================================
-- 2. Canonical rate-card resolver (most specific match wins)
-- =========================================================
CREATE OR REPLACE FUNCTION public.resolve_customer_price(
  p_direction text,
  p_source_currency text,
  p_dest_currency text,
  p_dest_country text DEFAULT NULL,
  p_payment_method text DEFAULT NULL,
  p_customer_type text DEFAULT 'consumer',
  p_at timestamptz DEFAULT now()
)
RETURNS TABLE (
  id uuid,
  fixed_fee numeric,
  percentage_fee numeric,
  min_fee numeric,
  max_fee numeric,
  fx_margin_bps numeric,
  specificity integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    p.fixed_fee,
    p.percentage_fee,
    p.min_fee,
    p.max_fee,
    p.fx_margin_bps,
    ( (CASE WHEN p.source_currency = '*' THEN 0 ELSE 16 END)
    + (CASE WHEN p.dest_currency   = '*' THEN 0 ELSE 16 END)
    + (CASE WHEN p.dest_country   IS NULL THEN 0 ELSE 8 END)
    + (CASE WHEN p.payment_method IS NULL THEN 0 ELSE 4 END)
    + (CASE WHEN p.customer_type  IS NULL THEN 0 ELSE 2 END) )::int AS specificity
  FROM public.efinmoney_pricing p
  WHERE p.direction::text = p_direction
    AND (p.source_currency = '*' OR upper(p.source_currency) = upper(p_source_currency))
    AND (p.dest_currency   = '*' OR upper(p.dest_currency)   = upper(p_dest_currency))
    AND (p.dest_country   IS NULL OR p_dest_country IS NULL OR upper(p.dest_country) = upper(p_dest_country))
    AND (p.payment_method IS NULL OR p_payment_method IS NULL OR p.payment_method = p_payment_method)
    AND (p.customer_type  IS NULL OR p.customer_type = COALESCE(p_customer_type, 'consumer'))
    AND p.effective_from <= p_at
    AND (p.effective_to IS NULL OR p.effective_to > p_at)
  ORDER BY specificity DESC, p.effective_from DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_customer_price(text, text, text, text, text, text, timestamptz) TO authenticated, anon, service_role;

-- =========================================================
-- 3. Pricing & Margin statement
-- =========================================================
CREATE OR REPLACE FUNCTION public.pricing_margin_statement(
  p_from timestamptz DEFAULT now() - interval '30 days',
  p_to   timestamptz DEFAULT now(),
  p_group_by text DEFAULT 'corridor'
)
RETURNS TABLE (
  group_key text,
  group_label text,
  txn_count bigint,
  volume numeric,
  posted_revenue numeric,
  modelled_revenue numeric,
  modelled_cost numeric,
  billed_cost numeric,
  gross_margin numeric,
  margin_percent numeric,
  revenue_variance numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_pricing_manager(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH econ AS (
    SELECT
      te.transfer_id,
      CASE p_group_by
        WHEN 'partner'  THEN COALESCE(pp.code, 'unattributed')
        WHEN 'method'   THEN COALESCE(te.payment_method, 'unspecified')
        WHEN 'currency' THEN te.dest_currency::text
        ELSE te.source_currency || '->' || te.dest_currency
      END AS gkey,
      CASE p_group_by
        WHEN 'partner'  THEN COALESCE(pp.name, 'Unattributed')
        WHEN 'method'   THEN COALESCE(te.payment_method, 'Unspecified')
        WHEN 'currency' THEN te.dest_currency::text
        ELSE te.source_currency || ' → ' || te.dest_currency
      END AS glabel,
      te.amount,
      te.total_revenue,
      te.total_cost
    FROM public.transaction_economics te
    LEFT JOIN public.payment_partners pp ON pp.id = te.partner_id
    WHERE te.created_at >= p_from AND te.created_at <= p_to
  ),
  posted AS (
    SELECT le.reference_id AS transfer_id,
           SUM(le.credit_amount - le.debit_amount) AS revenue
      FROM public.ledger_entries le
      JOIN public.ledger_accounts la ON la.id = le.account_id
     WHERE la.account_type = 'income'
       AND le.created_at >= p_from AND le.created_at <= p_to
       AND le.reference_id IS NOT NULL
     GROUP BY le.reference_id
  ),
  billed AS (
    SELECT pil.transfer_id, SUM(pil.billed_fee) AS billed_fee
      FROM public.partner_invoice_lines pil
      JOIN public.partner_invoices pi ON pi.id = pil.invoice_id
     WHERE pil.transfer_id IS NOT NULL
       AND pi.status IN ('approved', 'settled', 'paid')
     GROUP BY pil.transfer_id
  )
  SELECT
    e.gkey,
    e.glabel,
    COUNT(*)::bigint,
    ROUND(SUM(e.amount)::numeric, 2),
    ROUND(COALESCE(SUM(po.revenue), 0)::numeric, 2),
    ROUND(SUM(e.total_revenue)::numeric, 2),
    ROUND(SUM(e.total_cost)::numeric, 2),
    ROUND(COALESCE(SUM(b.billed_fee), 0)::numeric, 2),
    ROUND((COALESCE(SUM(po.revenue), SUM(e.total_revenue)) - GREATEST(COALESCE(SUM(b.billed_fee), 0), SUM(e.total_cost)))::numeric, 2),
    CASE WHEN COALESCE(SUM(po.revenue), 0) > 0
      THEN ROUND(((COALESCE(SUM(po.revenue), 0) - GREATEST(COALESCE(SUM(b.billed_fee), 0), SUM(e.total_cost))) / COALESCE(SUM(po.revenue), 1) * 100)::numeric, 2)
      ELSE 0 END,
    ROUND((COALESCE(SUM(po.revenue), 0) - SUM(e.total_revenue))::numeric, 2)
  FROM econ e
  LEFT JOIN posted po ON po.transfer_id = e.transfer_id
  LEFT JOIN billed b  ON b.transfer_id  = e.transfer_id
  GROUP BY e.gkey, e.glabel
  ORDER BY 4 DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pricing_margin_statement(timestamptz, timestamptz, text) TO authenticated, service_role;

-- =========================================================
-- 4. Revenue assurance — quoted vs booked fee per transfer
-- =========================================================
CREATE OR REPLACE FUNCTION public.revenue_assurance_variance(
  p_from timestamptz DEFAULT now() - interval '30 days',
  p_to   timestamptz DEFAULT now(),
  p_min_variance numeric DEFAULT 0.01,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  transfer_id uuid,
  created_at timestamptz,
  corridor text,
  payment_method text,
  amount numeric,
  expected_revenue numeric,
  posted_revenue numeric,
  variance numeric,
  currency_code text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_pricing_manager(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH posted AS (
    SELECT le.reference_id AS tid,
           SUM(le.credit_amount - le.debit_amount) AS revenue
      FROM public.ledger_entries le
      JOIN public.ledger_accounts la ON la.id = le.account_id
     WHERE la.account_type = 'income'
       AND le.reference_type = 'transfer'
       AND le.created_at >= p_from AND le.created_at <= p_to
     GROUP BY le.reference_id
  )
  SELECT
    te.transfer_id,
    te.created_at,
    te.source_currency || ' → ' || te.dest_currency,
    COALESCE(te.payment_method, 'unspecified'),
    ROUND(te.amount::numeric, 2),
    ROUND(te.total_revenue::numeric, 2),
    ROUND(COALESCE(po.revenue, 0)::numeric, 2),
    ROUND((COALESCE(po.revenue, 0) - te.total_revenue)::numeric, 2),
    te.currency_code::text
  FROM public.transaction_economics te
  LEFT JOIN posted po ON po.tid = te.transfer_id
  WHERE te.created_at >= p_from AND te.created_at <= p_to
    AND ABS(COALESCE(po.revenue, 0) - te.total_revenue) >= p_min_variance
  ORDER BY ABS(COALESCE(po.revenue, 0) - te.total_revenue) DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revenue_assurance_variance(timestamptz, timestamptz, numeric, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';