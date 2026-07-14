-- Pricing rules: per-corridor fee (%), fee ($), and FX markup (%).
-- Managed by admin/finance in the Pricing admin page. Readable by authenticated users.
CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  source_currency varchar(10) NOT NULL,
  dest_country varchar(2) NOT NULL,
  dest_currency varchar(10) NOT NULL,
  payout_method varchar(20) NOT NULL DEFAULT 'bank',
  fee_percent numeric(6,3) NOT NULL DEFAULT 0,       -- rate %
  fee_fixed numeric(20,2) NOT NULL DEFAULT 0,        -- rate $ (in source currency)
  fx_markup_percent numeric(6,3) NOT NULL DEFAULT 0, -- FX markup %
  min_amount numeric(20,2) NOT NULL DEFAULT 1,
  max_amount numeric(20,2) NOT NULL DEFAULT 10000,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (source_currency, dest_country, dest_currency, payout_method)
);

-- Explicit GRANTs (RLS alone is not enough — writes 42501 without these)
GRANT SELECT ON public.pricing_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pricing_rules TO authenticated;
GRANT ALL ON public.pricing_rules TO service_role;

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pricing rules are readable by authenticated"
  ON public.pricing_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins and finance can manage pricing rules"
  ON public.pricing_rules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'finance'::app_role));

CREATE TRIGGER pricing_rules_updated_at
  BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the live corridors so the table isn't empty on first open (illustrative defaults).
INSERT INTO public.pricing_rules
  (name, source_currency, dest_country, dest_currency, payout_method, fee_percent, fee_fixed, fx_markup_percent, min_amount, max_amount, enabled)
VALUES
  ('Canada → Nigeria (bank)',  'CAD', 'NG', 'NGN', 'bank',        1.500, 2.99, 1.000, 5, 10000, true),
  ('USA → Nigeria (bank)',     'USD', 'NG', 'NGN', 'bank',        1.500, 2.99, 1.000, 5, 10000, true),
  ('Canada → Ghana (MoMo)',    'CAD', 'GH', 'GHS', 'mobile_money', 1.750, 2.99, 1.250, 5, 8000,  true),
  ('USA → Ghana (MoMo)',       'USD', 'GH', 'GHS', 'mobile_money', 1.750, 2.99, 1.250, 5, 8000,  true)
ON CONFLICT (source_currency, dest_country, dest_currency, payout_method) DO NOTHING;
