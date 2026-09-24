-- Nigeria NGN bank payout: Fincra first, Nomba/Flovide/Flutterwave failover.

UPDATE public.corridor_rail_policies
SET
  preferred_partner = 'fincra',
  failover_partners = ARRAY['nomba', 'flovide', 'flutterwave', 'swychr'],
  enabled = true,
  notes = 'NGN bank: Fincra first (NGN/CAD float), Nomba + Flovide + Flutterwave failover',
  updated_at = now()
WHERE direction = 'payout'
  AND country_code = 'NG'
  AND currency_code = 'NGN';

INSERT INTO public.corridor_rail_policies (
  direction, country_code, currency_code, preferred_partner, failover_partners, enabled, notes
)
SELECT
  'payout', 'NG', 'NGN', 'fincra', ARRAY['nomba', 'flovide', 'flutterwave', 'swychr'], true,
  'NGN bank: Fincra first (NGN/CAD float), Nomba + Flovide + Flutterwave failover'
WHERE NOT EXISTS (
  SELECT 1 FROM public.corridor_rail_policies
  WHERE direction = 'payout' AND country_code = 'NG' AND currency_code = 'NGN'
);
