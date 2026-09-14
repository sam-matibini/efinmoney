-- CAD collect: Nomba Checkout first (instant settlement: card + Interac e-Transfer).
-- Fincra Autodeposit is the failover. Never Flutterwave MoMo, Flovide, or Paysafe.

UPDATE public.corridor_rail_policies
SET
  preferred_partner = 'nomba',
  failover_partners = ARRAY['interac', 'wise', 'dodo']::text[],
  enabled = true,
  notes = 'CAD collect: Nomba Checkout (card + Interac e-Transfer, instant) → Fincra Autodeposit → Wise → Dodo',
  updated_at = now()
WHERE direction = 'collect'
  AND currency_code = 'CAD';

INSERT INTO public.corridor_rail_policies (
  direction, country_code, currency_code, preferred_partner, failover_partners, enabled, notes
)
VALUES
  (
    'collect',
    'CA',
    'CAD',
    'nomba',
    ARRAY['interac', 'wise', 'dodo']::text[],
    true,
    'CAD collect: Nomba Checkout (card + Interac e-Transfer, instant) → Fincra Autodeposit → Wise → Dodo'
  ),
  (
    'collect',
    '',
    'CAD',
    'nomba',
    ARRAY['interac', 'wise', 'dodo']::text[],
    true,
    'CAD collect (any country): Nomba Checkout first for instant settlement'
  )
ON CONFLICT (direction, country_code, currency_code) DO UPDATE SET
  preferred_partner = EXCLUDED.preferred_partner,
  failover_partners = EXCLUDED.failover_partners,
  enabled = true,
  notes = EXCLUDED.notes,
  updated_at = now();

-- Nomba collect covers CAD card + Interac e-Transfer (Checkout Intl Transfer).
UPDATE public.payment_partners
SET
  payment_methods = '{bank,mobile_money,card,interac,eft}',
  updated_at = now()
WHERE code = 'nomba';

INSERT INTO public.partner_corridors
  (partner_id, direction, source_country, dest_country, source_currency, dest_currency, payment_method, enabled, est_minutes, live_routing_enabled)
SELECT p.id, v.direction::public.partner_direction, v.src_country, v.dst_country, v.src_ccy, v.dst_ccy, v.method, true, v.mins, true
FROM (VALUES
  ('nomba','payin','CA','CA','CAD','CAD','card',1),
  ('nomba','payin','CA','CA','CAD','CAD','eft',1),
  ('nomba','payin','CA','CA','CAD','CAD','interac',1),
  ('fincra','payin','CA','CA','CAD','CAD','interac',60)
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
SET
  live_routing_enabled = true,
  enabled = true,
  est_minutes = CASE
    WHEN p.code = 'nomba' AND coalesce(c.payment_method, '') IN ('card', 'eft', 'interac') THEN 1
    ELSE c.est_minutes
  END,
  updated_at = now()
FROM public.payment_partners p
WHERE c.partner_id = p.id
  AND p.code = 'nomba'
  AND c.direction IN ('payin', 'both')
  AND coalesce(c.dest_currency, c.source_currency, '') = 'CAD';

NOTIFY pgrst, 'reload schema';
