ALTER TABLE public.transaction_economics
  ADD COLUMN IF NOT EXISTS economics_source text NOT NULL DEFAULT 'routed',
  ADD COLUMN IF NOT EXISTS pricing_missing boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS transaction_economics_created_idx
  ON public.transaction_economics (created_at DESC);

-- Aggregated profitability by partner / corridor / currency
CREATE OR REPLACE FUNCTION public.profitability_summary(
  p_from timestamptz DEFAULT now() - interval '30 days',
  p_to timestamptz DEFAULT now(),
  p_group_by text DEFAULT 'partner'
)
RETURNS TABLE (
  group_key text,
  group_label text,
  txn_count bigint,
  volume numeric,
  revenue numeric,
  cost numeric,
  profit numeric,
  margin_percent numeric,
  pricing_gaps bigint
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
  SELECT
    CASE p_group_by
      WHEN 'corridor' THEN te.source_currency || '->' || te.dest_currency || COALESCE(' · ' || te.dest_country, '')
      WHEN 'currency' THEN te.dest_currency::text
      WHEN 'method'   THEN COALESCE(te.payment_method, 'unspecified')
      ELSE COALESCE(pp.code, 'unattributed')
    END AS group_key,
    CASE p_group_by
      WHEN 'corridor' THEN te.source_currency || ' → ' || te.dest_currency || COALESCE(' · ' || te.dest_country, '')
      WHEN 'currency' THEN te.dest_currency::text
      WHEN 'method'   THEN COALESCE(te.payment_method, 'Unspecified')
      ELSE COALESCE(pp.name, 'Unattributed')
    END AS group_label,
    COUNT(*)::bigint,
    ROUND(SUM(te.amount)::numeric, 2),
    ROUND(SUM(te.total_revenue)::numeric, 2),
    ROUND(SUM(te.total_cost)::numeric, 2),
    ROUND(SUM(te.gross_profit)::numeric, 2),
    CASE WHEN SUM(te.total_revenue) > 0
      THEN ROUND((SUM(te.gross_profit) / SUM(te.total_revenue) * 100)::numeric, 2)
      ELSE 0 END,
    COUNT(*) FILTER (WHERE te.pricing_missing)::bigint
  FROM public.transaction_economics te
  LEFT JOIN public.payment_partners pp ON pp.id = te.partner_id
  WHERE te.created_at >= p_from AND te.created_at <= p_to
  GROUP BY 1, 2
  ORDER BY 7 DESC;
END;
$$;

-- Engine forecast vs realised profit
CREATE OR REPLACE FUNCTION public.routing_profit_variance(
  p_from timestamptz DEFAULT now() - interval '30 days',
  p_to timestamptz DEFAULT now(),
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  transfer_id uuid,
  created_at timestamptz,
  corridor text,
  amount numeric,
  expected_partner text,
  actual_partner text,
  expected_profit numeric,
  actual_profit numeric,
  variance numeric
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
  SELECT
    te.transfer_id,
    te.created_at,
    te.source_currency || ' → ' || te.dest_currency,
    ROUND(te.amount::numeric, 2),
    sel.name,
    act.name,
    ROUND(COALESCE(rd.best_expected_profit, 0)::numeric, 2),
    ROUND(te.gross_profit::numeric, 2),
    ROUND((te.gross_profit - COALESCE(rd.best_expected_profit, 0))::numeric, 2)
  FROM public.transaction_economics te
  JOIN public.routing_decisions rd ON rd.id = te.routing_decision_id
  LEFT JOIN public.payment_partners sel ON sel.id = rd.selected_partner_id
  LEFT JOIN public.payment_partners act ON act.id = te.partner_id
  WHERE te.created_at >= p_from AND te.created_at <= p_to
  ORDER BY ABS(te.gross_profit - COALESCE(rd.best_expected_profit, 0)) DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

-- Corridors that moved money without partner pricing on file
CREATE OR REPLACE FUNCTION public.pricing_coverage_gaps(
  p_from timestamptz DEFAULT now() - interval '90 days',
  p_to timestamptz DEFAULT now()
)
RETURNS TABLE (
  partner_code text,
  partner_name text,
  source_currency text,
  dest_currency text,
  dest_country text,
  payment_method text,
  txn_count bigint,
  volume numeric
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
  SELECT
    COALESCE(pp.code, 'unattributed'),
    COALESCE(pp.name, 'Unattributed'),
    te.source_currency::text,
    te.dest_currency::text,
    te.dest_country,
    te.payment_method,
    COUNT(*)::bigint,
    ROUND(SUM(te.amount)::numeric, 2)
  FROM public.transaction_economics te
  LEFT JOIN public.payment_partners pp ON pp.id = te.partner_id
  WHERE te.created_at >= p_from AND te.created_at <= p_to
    AND te.pricing_missing
  GROUP BY 1, 2, 3, 4, 5, 6
  ORDER BY 8 DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.profitability_summary(timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.routing_profit_variance(timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pricing_coverage_gaps(timestamptz, timestamptz) TO authenticated;