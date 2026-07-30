-- 1. Partner cost assurance -------------------------------------------------
CREATE TABLE public.partner_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.payment_partners(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency_code varchar(10) NOT NULL,
  billed_total numeric NOT NULL DEFAULT 0,
  expected_total numeric NOT NULL DEFAULT 0,
  variance_total numeric NOT NULL DEFAULT 0,
  matched_lines integer NOT NULL DEFAULT 0,
  unmatched_lines integer NOT NULL DEFAULT 0,
  missing_lines integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  uploaded_by uuid,
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, invoice_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_invoices TO authenticated;
GRANT ALL ON public.partner_invoices TO service_role;
ALTER TABLE public.partner_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing managers manage partner invoices"
  ON public.partner_invoices FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid()))
  WITH CHECK (public.is_pricing_manager(auth.uid()));

CREATE TRIGGER trg_partner_invoices_updated
  BEFORE UPDATE ON public.partner_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.partner_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.partner_invoices(id) ON DELETE CASCADE,
  partner_reference text,
  transfer_id uuid,
  transaction_date date,
  currency_code varchar(10),
  amount numeric,
  billed_fee numeric NOT NULL DEFAULT 0,
  expected_fee numeric,
  variance numeric,
  match_status text NOT NULL DEFAULT 'unmatched',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX partner_invoice_lines_invoice_idx ON public.partner_invoice_lines(invoice_id);
CREATE INDEX partner_invoice_lines_transfer_idx ON public.partner_invoice_lines(transfer_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_invoice_lines TO authenticated;
GRANT ALL ON public.partner_invoice_lines TO service_role;
ALTER TABLE public.partner_invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing managers manage partner invoice lines"
  ON public.partner_invoice_lines FOR ALL TO authenticated
  USING (public.is_pricing_manager(auth.uid()))
  WITH CHECK (public.is_pricing_manager(auth.uid()));

CREATE TRIGGER trg_partner_invoice_lines_updated
  BEFORE UPDATE ON public.partner_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Liquidity freshness -----------------------------------------------------
ALTER TABLE public.payment_partners
  ADD COLUMN IF NOT EXISTS balance_function_slug text,
  ADD COLUMN IF NOT EXISTS liquidity_stale_minutes integer NOT NULL DEFAULT 720;

ALTER TABLE public.partner_liquidity
  ADD COLUMN IF NOT EXISTS refresh_error text;

-- 3. Corridor readiness ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corridor_readiness()
RETURNS TABLE(
  corridor_id uuid,
  partner_id uuid,
  partner_code text,
  partner_name text,
  direction text,
  source_currency varchar,
  dest_currency varchar,
  dest_country text,
  payment_method text,
  enabled boolean,
  live_routing_enabled boolean,
  has_pricing boolean,
  has_fx boolean,
  has_liquidity boolean,
  liquidity_stale boolean,
  has_performance boolean,
  ready boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT
      c.id AS corridor_id,
      p.id AS partner_id,
      p.code AS partner_code,
      p.name AS partner_name,
      c.direction::text AS direction,
      c.source_currency,
      c.dest_currency,
      c.dest_country,
      c.payment_method,
      c.enabled,
      c.live_routing_enabled,
      EXISTS (
        SELECT 1 FROM public.partner_pricing pp
         WHERE pp.partner_id = p.id
           AND pp.source_currency = c.source_currency
           AND pp.dest_currency = c.dest_currency
           AND pp.effective_to IS NULL
      ) AS has_pricing,
      (
        c.source_currency = c.dest_currency
        OR EXISTS (
          SELECT 1 FROM public.partner_fx_rates fr
           WHERE fr.partner_id = p.id
             AND fr.base_currency = c.source_currency
             AND fr.quote_currency = c.dest_currency
             AND fr.rate_timestamp > now() - interval '48 hours'
        )
      ) AS has_fx,
      EXISTS (
        SELECT 1 FROM public.partner_liquidity pl
         WHERE pl.partner_id = p.id AND pl.currency_code = c.dest_currency
      ) AS has_liquidity,
      COALESCE((
        SELECT pl.as_of < now() - make_interval(mins => COALESCE(p.liquidity_stale_minutes, 720))
          FROM public.partner_liquidity pl
         WHERE pl.partner_id = p.id AND pl.currency_code = c.dest_currency
         LIMIT 1
      ), true) AS liquidity_stale,
      EXISTS (
        SELECT 1 FROM public.partner_performance perf
         WHERE perf.partner_id = p.id AND perf.total_count > 0
      ) AS has_performance
    FROM public.partner_corridors c
    JOIN public.payment_partners p ON p.id = c.partner_id
  )
  SELECT b.*,
         (b.has_pricing AND b.has_fx AND b.has_liquidity AND NOT b.liquidity_stale) AS ready
    FROM base b
   WHERE public.is_pricing_manager(auth.uid())
   ORDER BY b.partner_code, b.source_currency, b.dest_currency;
$$;

-- 4. Cost assurance report ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.cost_assurance_summary(
  p_from timestamptz DEFAULT now() - interval '90 days',
  p_to timestamptz DEFAULT now()
)
RETURNS TABLE(
  partner_id uuid,
  partner_code text,
  partner_name text,
  invoice_count integer,
  billed_total numeric,
  expected_total numeric,
  variance_total numeric,
  unmatched_lines integer,
  missing_lines integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    p.code,
    p.name,
    COUNT(i.id)::int,
    COALESCE(SUM(i.billed_total), 0),
    COALESCE(SUM(i.expected_total), 0),
    COALESCE(SUM(i.variance_total), 0),
    COALESCE(SUM(i.unmatched_lines), 0)::int,
    COALESCE(SUM(i.missing_lines), 0)::int
  FROM public.partner_invoices i
  JOIN public.payment_partners p ON p.id = i.partner_id
  WHERE i.created_at >= p_from
    AND i.created_at <= p_to
    AND public.is_pricing_manager(auth.uid())
  GROUP BY p.id, p.code, p.name
  ORDER BY ABS(COALESCE(SUM(i.variance_total), 0)) DESC;
$$;