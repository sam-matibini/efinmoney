ALTER TABLE public.partner_invoice_lines
  ADD COLUMN IF NOT EXISTS match_method text NOT NULL DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS match_reference text;

ALTER TABLE public.payment_partners
  ADD COLUMN IF NOT EXISTS statement_mapping jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.billed_cost_summary(
  p_from timestamp with time zone,
  p_to timestamp with time zone,
  p_group_by text DEFAULT 'partner'
)
RETURNS TABLE(group_key text, group_label text, billed_cost numeric, billed_lines bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_pricing_manager(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH lines AS (
    SELECT
      l.billed_fee,
      i.partner_id,
      p.code AS partner_code,
      p.name AS partner_name,
      e.source_currency,
      e.dest_currency,
      e.dest_country,
      e.payment_method,
      i.currency_code
    FROM public.partner_invoice_lines l
    JOIN public.partner_invoices i ON i.id = l.invoice_id
    LEFT JOIN public.payment_partners p ON p.id = i.partner_id
    LEFT JOIN public.transaction_economics e ON e.transfer_id = l.transfer_id
    WHERE i.status IN ('approved', 'paid')
      AND l.dispute_status <> 'disputed'
      AND i.period_start >= (p_from AT TIME ZONE 'UTC')::date
      AND i.period_end <= (p_to AT TIME ZONE 'UTC')::date
  )
  SELECT
    CASE p_group_by
      WHEN 'corridor' THEN COALESCE(source_currency, '?') || '->' || COALESCE(dest_currency, '?') ||
        COALESCE(' · ' || dest_country, '')
      WHEN 'currency' THEN COALESCE(source_currency, currency_code, '?')
      WHEN 'method' THEN COALESCE(payment_method, 'unspecified')
      ELSE COALESCE(partner_id::text, 'unknown')
    END AS group_key,
    CASE p_group_by
      WHEN 'corridor' THEN COALESCE(source_currency, '?') || ' → ' || COALESCE(dest_currency, '?') ||
        COALESCE(' · ' || dest_country, '')
      WHEN 'currency' THEN COALESCE(source_currency, currency_code, '?')
      WHEN 'method' THEN COALESCE(payment_method, 'Unspecified')
      ELSE COALESCE(partner_name, partner_code, 'Unknown partner')
    END AS group_label,
    ROUND(COALESCE(SUM(billed_fee), 0), 2) AS billed_cost,
    COUNT(*)::bigint AS billed_lines
  FROM lines
  GROUP BY 1, 2
  ORDER BY 3 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.billed_cost_summary(timestamp with time zone, timestamp with time zone, text) FROM public;
GRANT EXECUTE ON FUNCTION public.billed_cost_summary(timestamp with time zone, timestamp with time zone, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billed_cost_summary(timestamp with time zone, timestamp with time zone, text) TO service_role;