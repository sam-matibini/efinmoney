UPDATE public.partner_pricing pp
SET fx_markup_bps = v.bps
FROM public.payment_partners p,
     (VALUES ('fincra',180),('flutterwave',200),('nomba',190),('swychr',220),
             ('paytota',210),('pawapay',150),('yellowcard',175),('stripe',100),
             ('circle_cpn',60),('stellar',120),('mtn_momo',160),('ghanapay',170)) AS v(code,bps)
WHERE pp.partner_id = p.id
  AND p.code = v.code
  AND pp.source_currency IS DISTINCT FROM pp.dest_currency
  AND COALESCE(pp.fx_markup_bps,0) = 0;

COMMENT ON COLUMN public.partner_pricing.fx_markup_bps IS 'Indicative partner FX spread over mid-market, in basis points. Zero for same-currency rows (no conversion). Replace with measured spread once live partner_fx_rates quotes accumulate.';