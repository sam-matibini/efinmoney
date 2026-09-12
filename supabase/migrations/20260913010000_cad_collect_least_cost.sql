-- CAD collect: activate live pay-in rails on least-cost + availability.
-- Interac Autodeposit (Fincra) is cheapest; Wise EFT next; Nomba card + bank/EFT
-- checkout after that. Never Flutterwave MoMo, Flovide, or Paysafe for CAD collect.

INSERT INTO public.corridor_rail_policies (
  direction, country_code, currency_code, preferred_partner, failover_partners, enabled, notes
)
VALUES
  (
    'collect',
    'CA',
    'CAD',
    'interac',
    ARRAY['wise', 'nomba', 'dodo']::text[],
    true,
    'CAD collect least cost: Interac Autodeposit → Wise EFT → Nomba card/EFT → Dodo'
  ),
  (
    'collect',
    '',
    'CAD',
    'interac',
    ARRAY['wise', 'nomba', 'dodo']::text[],
    true,
    'CAD collect least cost (any country): Interac → Wise → Nomba card/EFT'
  )
ON CONFLICT (direction, country_code, currency_code) DO UPDATE SET
  preferred_partner = EXCLUDED.preferred_partner,
  failover_partners = EXCLUDED.failover_partners,
  enabled = true,
  notes = EXCLUDED.notes,
  updated_at = now();

-- Nomba collect coverage includes CAD card + bank/EFT (Checkout methods).
UPDATE public.payment_partners
SET
  payment_methods = '{bank,mobile_money,card,interac,eft}',
  updated_at = now()
WHERE code = 'nomba';

-- Partner corridor: CAD collect via Nomba (card + EFT) and Fincra Interac.
INSERT INTO public.partner_corridors
  (partner_id, direction, source_country, dest_country, source_currency, dest_currency, payment_method, enabled, est_minutes, live_routing_enabled)
SELECT p.id, v.direction::public.partner_direction, v.src_country, v.dst_country, v.src_ccy, v.dst_ccy, v.method, true, v.mins, true
FROM (VALUES
  ('nomba','payin','CA','CA','CAD','CAD','card',5),
  ('nomba','payin','CA','CA','CAD','CAD','eft',15),
  ('fincra','payin','CA','CA','CAD','CAD','interac',5),
  ('wise','payin','CA','CA','CAD','CAD','bank',60)
) AS v(code, direction, src_country, dst_country, src_ccy, dst_ccy, method, mins)
JOIN public.payment_partners p ON p.code = v.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.partner_corridors c
  WHERE c.partner_id = p.id
    AND c.direction = v.direction::public.partner_direction
    AND coalesce(c.source_currency,'') = v.src_ccy
    AND coalesce(c.dest_currency,'') = v.dst_ccy
    AND coalesce(c.dest_country,'') = v.dst_country
    AND coalesce(c.payment_method,'') = v.method
);

UPDATE public.partner_corridors c
SET live_routing_enabled = true, enabled = true, updated_at = now()
FROM public.payment_partners p
WHERE c.partner_id = p.id
  AND p.code IN ('nomba', 'fincra', 'wise')
  AND c.direction IN ('payin', 'both')
  AND coalesce(c.dest_currency, c.source_currency, '') = 'CAD';

NOTIFY pgrst, 'reload schema';
