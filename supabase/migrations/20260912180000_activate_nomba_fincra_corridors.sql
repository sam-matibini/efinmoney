-- Activate Nomba/Fincra payout corridors with availability + least-cost ranking.
-- Canada CAD payout stays Nomba-only (Interac/EFT). Zambia stays Fincra (no Nomba ZMW).

-- 1. Ops rail policies: Nomba preferred where it pays; Fincra first failover.
INSERT INTO public.corridor_rail_policies (
  direction, country_code, currency_code, preferred_partner, failover_partners, enabled, notes
)
VALUES
  ('payout', 'NG', 'NGN', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'GH', 'GHS', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'KE', 'KES', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'UG', 'UGX', 'nomba', ARRAY['fincra'], true, 'Canada→Uganda MoMo: Nomba / Fincra least cost'),
  ('payout', 'TZ', 'TZS', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'RW', 'RWF', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'ZM', 'ZMW', 'fincra', ARRAY['elicate'], true, 'Zambia — Nomba unsupported; Fincra'),
  ('payout', 'SN', 'XOF', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'CI', 'XOF', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'BJ', 'XOF', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'TG', 'XOF', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'BF', 'XOF', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'ML', 'XOF', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'NE', 'XOF', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'CM', 'XAF', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'CG', 'XAF', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'ET', 'ETB', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout (Fincra has no ETB)'),
  ('payout', 'CD', 'CDF', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout (Fincra has no CDF)'),
  ('payout', 'ZA', 'ZAR', 'nomba', ARRAY['fincra'], true, 'Availability + least cost: Nomba / Fincra'),
  ('payout', 'AE', 'AED', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout bank'),
  ('payout', 'GB', 'GBP', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout bank'),
  ('payout', 'DE', 'EUR', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout bank'),
  ('payout', 'FR', 'EUR', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout bank'),
  ('payout', 'IT', 'EUR', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout bank'),
  ('payout', 'ES', 'EUR', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout bank'),
  ('payout', 'NL', 'EUR', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout bank'),
  ('payout', 'BE', 'EUR', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout bank'),
  ('payout', 'PT', 'EUR', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout bank'),
  ('payout', 'IE', 'EUR', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout bank'),
  ('payout', 'AT', 'EUR', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout bank'),
  ('payout', 'US', 'USD', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout bank'),
  ('payout', 'CA', 'CAD', 'nomba', ARRAY[]::text[], true, 'Nomba Interac/EFT only — not Fincra, not M-Pesa')
ON CONFLICT (direction, country_code, currency_code) DO UPDATE SET
  preferred_partner = EXCLUDED.preferred_partner,
  failover_partners = EXCLUDED.failover_partners,
  enabled = true,
  notes = EXCLUDED.notes,
  updated_at = now();

-- 2. Expand Nomba / Fincra partner coverage metadata
UPDATE public.payment_partners
SET
  supported_currencies = '{NGN,GHS,KES,UGX,TZS,RWF,XOF,XAF,ETB,CDF,ZAR,AED,CAD,GBP,EUR,USD}',
  supported_countries = '{NG,GH,KE,UG,TZ,RW,SN,CI,CM,ET,CD,ZA,AE,CA,GB,DE,US}',
  payment_methods = '{bank,mobile_money,card,interac,eft}',
  updated_at = now()
WHERE code = 'nomba';

UPDATE public.payment_partners
SET
  supported_currencies = '{NGN,GHS,KES,ZMW,UGX,TZS,RWF,ZAR,XOF,XAF,CAD}',
  supported_countries = '{NG,GH,KE,ZM,UG,TZ,RW,ZA,SN,CI,CM,CA}',
  updated_at = now()
WHERE code = 'fincra';

-- 3. Partner corridor map: CA/US/NG sources → Nomba/Fincra destinations
INSERT INTO public.partner_corridors
  (partner_id, direction, source_country, dest_country, source_currency, dest_currency, payment_method, enabled, est_minutes, live_routing_enabled)
SELECT p.id, v.direction::public.partner_direction, v.src_country, v.dst_country, v.src_ccy, v.dst_ccy, v.method, true, v.mins, true
FROM (VALUES
  -- Nomba CAD → Africa / bank
  ('nomba','payout','CA','UG','CAD','UGX','mobile_money',5),
  ('nomba','payout','CA','TZ','CAD','TZS','mobile_money',5),
  ('nomba','payout','CA','RW','CAD','RWF','mobile_money',5),
  ('nomba','payout','CA','GH','CAD','GHS','mobile_money',5),
  ('nomba','payout','CA','KE','CAD','KES','mobile_money',5),
  ('nomba','payout','CA','SN','CAD','XOF','mobile_money',10),
  ('nomba','payout','CA','CI','CAD','XOF','mobile_money',10),
  ('nomba','payout','CA','BJ','CAD','XOF','mobile_money',10),
  ('nomba','payout','CA','TG','CAD','XOF','mobile_money',10),
  ('nomba','payout','CA','BF','CAD','XOF','mobile_money',10),
  ('nomba','payout','CA','ML','CAD','XOF','mobile_money',10),
  ('nomba','payout','CA','NE','CAD','XOF','mobile_money',10),
  ('nomba','payout','CA','CM','CAD','XAF','mobile_money',10),
  ('nomba','payout','CA','CG','CAD','XAF','mobile_money',10),
  ('nomba','payout','CA','ET','CAD','ETB','mobile_money',15),
  ('nomba','payout','CA','CD','CAD','CDF','mobile_money',15),
  ('nomba','payout','CA','ZA','CAD','ZAR','bank',15),
  ('nomba','payout','CA','AE','CAD','AED','bank',15),
  ('nomba','payout','CA','GB','CAD','GBP','bank',15),
  ('nomba','payout','CA','DE','CAD','EUR','bank',15),
  ('nomba','payout','CA','FR','CAD','EUR','bank',15),
  ('nomba','payout','CA','US','CAD','USD','bank',15),
  ('nomba','payout','CA','NG','CAD','NGN','bank',3),
  ('nomba','payout','CA','CA','CAD','CAD','interac',5),
  -- Nomba USD / NGN → Uganda and core Africa
  ('nomba','payout','US','UG','USD','UGX','mobile_money',5),
  ('nomba','payout','NG','UG','NGN','UGX','mobile_money',5),
  ('nomba','payout','US','KE','USD','KES','mobile_money',5),
  ('nomba','payout','US','GH','USD','GHS','mobile_money',5),
  -- Fincra CAD → destinations it can pay (not CAD payout)
  ('fincra','payout','CA','UG','CAD','UGX','mobile_money',10),
  ('fincra','payout','CA','TZ','CAD','TZS','mobile_money',10),
  ('fincra','payout','CA','RW','CAD','RWF','mobile_money',10),
  ('fincra','payout','CA','GH','CAD','GHS','mobile_money',10),
  ('fincra','payout','CA','KE','CAD','KES','mobile_money',10),
  ('fincra','payout','CA','ZM','CAD','ZMW','mobile_money',10),
  ('fincra','payout','CA','NG','CAD','NGN','bank',10),
  ('fincra','payout','CA','SN','CAD','XOF','mobile_money',15),
  ('fincra','payout','CA','CI','CAD','XOF','mobile_money',15),
  ('fincra','payout','CA','CM','CAD','XAF','mobile_money',15),
  ('fincra','payout','CA','ZA','CAD','ZAR','bank',15),
  ('fincra','payout','US','UG','USD','UGX','mobile_money',10),
  ('fincra','payout','NG','UG','NGN','UGX','mobile_money',10)
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

-- Turn live routing on for existing Nomba/Fincra payout corridors
UPDATE public.partner_corridors c
SET live_routing_enabled = true, enabled = true, updated_at = now()
FROM public.payment_partners p
WHERE c.partner_id = p.id
  AND p.code IN ('nomba', 'fincra')
  AND c.direction IN ('payout', 'both');

-- 4. Active payout rule = lowest cost among available rails
UPDATE public.routing_rules
SET
  name = 'Availability + lowest cost (Nomba / Fincra)',
  strategy = 'lowest_cost',
  updated_at = now()
WHERE is_active = true;

INSERT INTO public.routing_rules (name, strategy, is_active)
SELECT 'Availability + lowest cost (Nomba / Fincra)', 'lowest_cost', true
WHERE NOT EXISTS (SELECT 1 FROM public.routing_rules WHERE is_active = true);

NOTIFY pgrst, 'reload schema';
