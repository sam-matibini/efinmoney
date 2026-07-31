
CREATE TABLE IF NOT EXISTS public.margin_floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'global',
  direction text,
  source_currency varchar(10),
  dest_currency varchar(10),
  dest_country text,
  payment_method text,
  customer_type text,
  min_margin_percent numeric NOT NULL DEFAULT 1.5,
  action text NOT NULL DEFAULT 'warn',
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT margin_floors_scope_chk CHECK (scope IN ('global','corridor')),
  CONSTRAINT margin_floors_action_chk CHECK (action IN ('warn','uplift','block'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.margin_floors TO authenticated;
GRANT ALL ON public.margin_floors TO service_role;

ALTER TABLE public.margin_floors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing managers read margin floors"
  ON public.margin_floors FOR SELECT TO authenticated
  USING (public.is_pricing_manager(auth.uid()));

CREATE POLICY "Pricing managers manage margin floors"
  ON public.margin_floors FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid()))
  WITH CHECK (public.is_pricing_manager(auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS margin_floors_global_uniq
  ON public.margin_floors ((1)) WHERE scope = 'global';

CREATE INDEX IF NOT EXISTS margin_floors_corridor_idx
  ON public.margin_floors (source_currency, dest_currency) WHERE scope = 'corridor';

DROP TRIGGER IF EXISTS trg_margin_floors_updated_at ON public.margin_floors;
CREATE TRIGGER trg_margin_floors_updated_at
  BEFORE UPDATE ON public.margin_floors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.margin_floors (scope, min_margin_percent, action, notes)
SELECT 'global', 1.5, 'warn', 'Default network-wide margin floor'
WHERE NOT EXISTS (SELECT 1 FROM public.margin_floors WHERE scope = 'global');

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
  IF NOT public.is_pricing_manager(auth.uid()) THEN
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
