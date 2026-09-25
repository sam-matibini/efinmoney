-- Payout rails: Fincra first, Nomba failover only. Strip Flutterwave / Flovide / etc.

UPDATE public.corridor_rail_policies
SET
  preferred_partner = 'fincra',
  failover_partners = ARRAY['nomba'],
  notes = coalesce(notes, '') || ' | cleaned: Fincra→Nomba (Flutterwave removed from payout)',
  updated_at = now()
WHERE direction = 'payout'
  AND currency_code NOT IN ('CAD', 'USD')
  AND (
    preferred_partner IN ('flutterwave', 'flw', 'flovide', 'paytota', 'swychr')
    OR failover_partners && ARRAY['flutterwave', 'flw', 'flovide', 'paytota', 'swychr']
    OR preferred_partner = 'nomba'
  );

-- Keep CAD / USD policies as Fincra→Nomba (already set by prior migrations).
UPDATE public.corridor_rail_policies
SET
  preferred_partner = 'fincra',
  failover_partners = ARRAY['nomba'],
  updated_at = now()
WHERE direction = 'payout'
  AND currency_code IN ('CAD', 'USD')
  AND country_code IN ('CA', 'US');

-- NGN / Africa MoMo: ensure Fincra preferred
UPDATE public.corridor_rail_policies
SET
  preferred_partner = 'fincra',
  failover_partners = ARRAY['nomba'],
  enabled = true,
  updated_at = now()
WHERE direction = 'payout'
  AND currency_code IN ('NGN', 'GHS', 'KES', 'UGX', 'TZS', 'RWF', 'ZMW', 'XOF', 'XAF', 'ZAR');
