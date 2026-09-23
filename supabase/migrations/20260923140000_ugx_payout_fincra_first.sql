-- Uganda UGX MoMo: Fincra first. Nomba cannot quote UGX from trade region NG
-- (NGN/UGX and USD/UGX return no exchangeRateId on our account).

UPDATE public.corridor_rail_policies
SET
  preferred_partner = 'fincra',
  failover_partners = ARRAY['flutterwave', 'paytota', 'flovide', 'nomba'],
  enabled = true,
  notes = 'UGX MoMo: Fincra first (Nomba has no UGX FX pair from NG); Flutterwave / Paytota / Flovide / Nomba failover',
  updated_at = now()
WHERE direction = 'payout'
  AND country_code = 'UG'
  AND currency_code = 'UGX';

INSERT INTO public.corridor_rail_policies (
  direction, country_code, currency_code, preferred_partner, failover_partners, enabled, notes
)
SELECT
  'payout', 'UG', 'UGX', 'fincra', ARRAY['flutterwave', 'paytota', 'flovide', 'nomba'], true,
  'UGX MoMo: Fincra first (Nomba has no UGX FX pair from NG); Flutterwave / Paytota / Flovide / Nomba failover'
WHERE NOT EXISTS (
  SELECT 1 FROM public.corridor_rail_policies
  WHERE direction = 'payout' AND country_code = 'UG' AND currency_code = 'UGX'
);
