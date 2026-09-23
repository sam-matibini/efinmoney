-- Canada CAD Interac/EFT payout: Fincra first (CAD wallet / Autodeposit), Nomba failover.
-- Never Flutterwave / M-Pesa / Flovide / Paysafe for CAD payout.

UPDATE public.corridor_rail_policies
SET
  preferred_partner = 'fincra',
  failover_partners = ARRAY['nomba'],
  enabled = true,
  notes = 'CAD Interac/EFT: Fincra first (CAD float), Nomba failover',
  updated_at = now()
WHERE direction = 'payout'
  AND country_code = 'CA'
  AND currency_code = 'CAD';

INSERT INTO public.corridor_rail_policies (
  direction, country_code, currency_code, preferred_partner, failover_partners, enabled, notes
)
SELECT
  'payout', 'CA', 'CAD', 'fincra', ARRAY['nomba'], true,
  'CAD Interac/EFT: Fincra first (CAD float), Nomba failover'
WHERE NOT EXISTS (
  SELECT 1 FROM public.corridor_rail_policies
  WHERE direction = 'payout' AND country_code = 'CA' AND currency_code = 'CAD'
);
