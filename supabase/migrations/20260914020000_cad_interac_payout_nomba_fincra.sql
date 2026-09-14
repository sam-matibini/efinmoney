-- Canada CAD Interac/EFT payout: Nomba + Fincra on availability and least cost.
-- Never Flutterwave / M-Pesa / Flovide / Paysafe for CAD payout.

UPDATE public.corridor_rail_policies
SET
  preferred_partner = 'nomba',
  failover_partners = ARRAY['fincra'],
  enabled = true,
  notes = 'CAD Interac/EFT: Nomba and Fincra, ranked by availability + least cost',
  updated_at = now()
WHERE direction = 'payout'
  AND country_code = 'CA'
  AND currency_code = 'CAD';

INSERT INTO public.corridor_rail_policies (
  direction, country_code, currency_code, preferred_partner, failover_partners, enabled, notes
)
SELECT
  'payout', 'CA', 'CAD', 'nomba', ARRAY['fincra'], true,
  'CAD Interac/EFT: Nomba and Fincra, ranked by availability + least cost'
WHERE NOT EXISTS (
  SELECT 1 FROM public.corridor_rail_policies
  WHERE direction = 'payout' AND country_code = 'CA' AND currency_code = 'CAD'
);
