-- DRC (CD / CDF) payout via Nomba Global Payout mobile money only.
-- Subset of 20260912180000_activate_nomba_fincra_corridors.sql; other corridors untouched.

BEGIN;

INSERT INTO public.corridor_rail_policies (
  direction, country_code, currency_code, preferred_partner, failover_partners, enabled, notes
)
VALUES
  ('payout', 'CD', 'CDF', 'nomba', ARRAY[]::text[], true, 'Nomba Global Payout MoMo (Fincra has no CDF)')
ON CONFLICT (direction, country_code, currency_code) DO UPDATE SET
  preferred_partner = EXCLUDED.preferred_partner,
  failover_partners = EXCLUDED.failover_partners,
  enabled = true,
  notes = EXCLUDED.notes,
  updated_at = now();

UPDATE public.payment_partners
SET
  supported_countries = ARRAY(SELECT DISTINCT unnest(coalesce(supported_countries, '{}') || '{CD}'::text[])),
  supported_currencies = ARRAY(SELECT DISTINCT unnest(coalesce(supported_currencies, '{}') || '{CDF}'::text[])),
  payment_methods = ARRAY(SELECT DISTINCT unnest(coalesce(payment_methods, '{}') || '{mobile_money}'::text[])),
  updated_at = now()
WHERE code = 'nomba';

INSERT INTO public.partner_corridors
  (partner_id, direction, source_country, dest_country, source_currency, dest_currency, payment_method, enabled, est_minutes, live_routing_enabled)
SELECT p.id, 'payout'::public.partner_direction, 'CA', 'CD', 'CAD', 'CDF', 'mobile_money', true, 15, true
FROM public.payment_partners p
WHERE p.code = 'nomba'
  AND NOT EXISTS (
    SELECT 1 FROM public.partner_corridors c
    WHERE c.partner_id = p.id
      AND c.direction = 'payout'::public.partner_direction
      AND c.source_currency = 'CAD'
      AND c.dest_currency = 'CDF'
      AND c.dest_country = 'CD'
      AND c.payment_method = 'mobile_money'
  );

UPDATE public.partner_corridors c
SET enabled = true, live_routing_enabled = true, updated_at = now()
FROM public.payment_partners p
WHERE c.partner_id = p.id
  AND p.code = 'nomba'
  AND c.direction = 'payout'::public.partner_direction
  AND c.dest_country = 'CD'
  AND c.dest_currency = 'CDF';

COMMIT;

NOTIFY pgrst, 'reload schema';
