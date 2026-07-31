-- ============ pricing_proposals ============
CREATE TABLE IF NOT EXISTS public.pricing_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_key text NOT NULL,
  group_label text NOT NULL,
  direction public.partner_direction NOT NULL DEFAULT 'payout',
  source_currency varchar(10) NOT NULL,
  dest_currency varchar(10) NOT NULL,
  dest_country text,
  payment_method text,
  customer_type text NOT NULL DEFAULT 'consumer',
  current_fixed_fee numeric NOT NULL DEFAULT 0,
  current_percentage_fee numeric NOT NULL DEFAULT 0,
  current_fx_margin_bps numeric NOT NULL DEFAULT 0,
  proposed_fixed_fee numeric NOT NULL DEFAULT 0,
  proposed_percentage_fee numeric NOT NULL DEFAULT 0,
  proposed_fx_margin_bps numeric NOT NULL DEFAULT 0,
  fee_delta_percent numeric NOT NULL DEFAULT 0,
  txn_count integer NOT NULL DEFAULT 0,
  volume numeric NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  effective_cost numeric NOT NULL DEFAULT 0,
  current_margin_percent numeric NOT NULL DEFAULT 0,
  target_margin_percent numeric NOT NULL DEFAULT 0,
  expected_revenue_uplift numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'auto_scan',
  status text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  applied_pricing_id uuid,
  applied_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_proposals_source_chk CHECK (source IN ('auto_scan','manual')),
  CONSTRAINT pricing_proposals_status_chk CHECK (status IN ('pending','approved','rejected','applied','superseded'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_proposals TO authenticated;
GRANT ALL ON public.pricing_proposals TO service_role;

ALTER TABLE public.pricing_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing managers manage pricing proposals" ON public.pricing_proposals
  FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid()))
  WITH CHECK (public.is_pricing_manager(auth.uid()));

CREATE INDEX IF NOT EXISTS pricing_proposals_status_idx
  ON public.pricing_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS pricing_proposals_group_idx
  ON public.pricing_proposals(group_key, created_at DESC);

DROP TRIGGER IF EXISTS trg_pricing_proposals_updated_at ON public.pricing_proposals;
CREATE TRIGGER trg_pricing_proposals_updated_at
  BEFORE UPDATE ON public.pricing_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ fee_adjustment_settings ============
CREATE TABLE IF NOT EXISTS public.fee_adjustment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_singleton boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT false,
  auto_apply boolean NOT NULL DEFAULT false,
  target_margin_percent numeric NOT NULL DEFAULT 3.0,
  lookback_days integer NOT NULL DEFAULT 30,
  min_txn_count integer NOT NULL DEFAULT 20,
  min_volume numeric NOT NULL DEFAULT 10000,
  max_fee_delta_percent numeric NOT NULL DEFAULT 0.5,
  cooldown_days integer NOT NULL DEFAULT 14,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fee_adjustment_settings_singleton_uq UNIQUE (is_singleton)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_adjustment_settings TO authenticated;
GRANT ALL ON public.fee_adjustment_settings TO service_role;

ALTER TABLE public.fee_adjustment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing managers manage fee adjustment settings" ON public.fee_adjustment_settings
  FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid()))
  WITH CHECK (public.is_pricing_manager(auth.uid()));

DROP TRIGGER IF EXISTS trg_fee_adjustment_settings_updated_at ON public.fee_adjustment_settings;
CREATE TRIGGER trg_fee_adjustment_settings_updated_at
  BEFORE UPDATE ON public.fee_adjustment_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.fee_adjustment_settings (is_singleton) VALUES (true)
ON CONFLICT (is_singleton) DO NOTHING;

-- ============ allow background jobs to read recommendations ============
CREATE OR REPLACE FUNCTION public.pricing_recommendations(
  p_from timestamptz,
  p_to timestamptz,
  p_target_margin numeric DEFAULT 3.0
)
RETURNS TABLE(
  group_key text,
  group_label text,
  source_currency text,
  dest_currency text,
  dest_country text,
  payment_method text,
  txn_count bigint,
  volume numeric,
  revenue numeric,
  modelled_cost numeric,
  billed_cost numeric,
  effective_cost numeric,
  current_margin_percent numeric,
  target_margin_percent numeric,
  current_fixed_fee numeric,
  current_percentage_fee numeric,
  recommended_percentage_fee numeric,
  fee_delta_percent numeric,
  revenue_uplift numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_pricing_manager(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH econ AS (
    SELECT
      e.transfer_id,
      COALESCE(e.source_currency, '?')::text AS src,
      COALESCE(e.dest_currency, '?')::text AS dst,
      e.dest_country::text AS country,
      e.payment_method::text AS method,
      COALESCE(e.amount, 0) AS amount,
      COALESCE(e.total_revenue, 0) AS revenue,
      COALESCE(e.total_cost, 0) AS cost
    FROM public.transaction_economics e
    WHERE e.created_at >= p_from AND e.created_at <= p_to
  ),
  billed AS (
    SELECT l.transfer_id, SUM(l.billed_fee) AS billed_fee
    FROM public.partner_invoice_lines l
    JOIN public.partner_invoices i ON i.id = l.invoice_id
    WHERE i.status IN ('approved', 'paid')
      AND COALESCE(l.dispute_status, '') <> 'disputed'
      AND l.transfer_id IS NOT NULL
    GROUP BY l.transfer_id
  ),
  joined AS (
    SELECT e.*, b.billed_fee
    FROM econ e
    LEFT JOIN billed b ON b.transfer_id = e.transfer_id
  ),
  agg AS (
    SELECT
      src, dst, country, method,
      COUNT(*)::bigint AS txn_count,
      SUM(amount) AS volume,
      SUM(revenue) AS revenue,
      SUM(cost) AS modelled_cost,
      SUM(COALESCE(billed_fee, 0)) AS billed_cost,
      SUM(CASE WHEN billed_fee IS NOT NULL THEN billed_fee ELSE cost END) AS effective_cost
    FROM joined
    GROUP BY src, dst, country, method
  ),
  priced AS (
    SELECT
      a.*,
      (
        SELECT p.fixed_fee FROM public.efinmoney_pricing p
        WHERE p.effective_to IS NULL
          AND UPPER(p.source_currency::text) = a.src
          AND UPPER(p.dest_currency::text) = a.dst
          AND (p.dest_country IS NULL OR a.country IS NULL OR UPPER(p.dest_country) = UPPER(a.country))
          AND (p.payment_method IS NULL OR a.method IS NULL OR p.payment_method = a.method)
        ORDER BY p.effective_from DESC NULLS LAST LIMIT 1
      ) AS cur_fixed,
      (
        SELECT p.percentage_fee FROM public.efinmoney_pricing p
        WHERE p.effective_to IS NULL
          AND UPPER(p.source_currency::text) = a.src
          AND UPPER(p.dest_currency::text) = a.dst
          AND (p.dest_country IS NULL OR a.country IS NULL OR UPPER(p.dest_country) = UPPER(a.country))
          AND (p.payment_method IS NULL OR a.method IS NULL OR p.payment_method = a.method)
        ORDER BY p.effective_from DESC NULLS LAST LIMIT 1
      ) AS cur_pct
    FROM agg a
  )
  SELECT
    (src || '->' || dst || COALESCE(' · ' || country, '') || COALESCE(' · ' || method, ''))::text,
    (src || ' → ' || dst || COALESCE(' · ' || country, '') || COALESCE(' · ' || method, ''))::text,
    src, dst, country, method,
    txn_count,
    ROUND(volume, 2),
    ROUND(revenue, 2),
    ROUND(modelled_cost, 2),
    ROUND(billed_cost, 2),
    ROUND(effective_cost, 2),
    CASE WHEN volume > 0 THEN ROUND(((revenue - effective_cost) / volume) * 100, 3) ELSE 0 END,
    ROUND(p_target_margin, 3),
    ROUND(COALESCE(cur_fixed, 0), 4),
    ROUND(COALESCE(cur_pct, 0), 4),
    CASE
      WHEN volume > 0 THEN GREATEST(
        0,
        ROUND(
          COALESCE(cur_pct, 0)
          + (((effective_cost + volume * (p_target_margin / 100.0)) - revenue) / volume) * 100,
          4
        )
      )
      ELSE COALESCE(cur_pct, 0)
    END,
    CASE
      WHEN volume > 0 THEN ROUND((((effective_cost + volume * (p_target_margin / 100.0)) - revenue) / volume) * 100, 4)
      ELSE 0
    END,
    CASE
      WHEN volume > 0 THEN ROUND(GREATEST(0, (effective_cost + volume * (p_target_margin / 100.0)) - revenue), 2)
      ELSE 0
    END
  FROM priced
  ORDER BY volume DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.pricing_recommendations(timestamptz, timestamptz, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.pricing_recommendations(timestamptz, timestamptz, numeric) TO authenticated, service_role;