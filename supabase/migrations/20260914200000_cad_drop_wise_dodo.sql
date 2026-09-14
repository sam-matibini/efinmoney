-- CAD: drop Wise and Dodo from pay-in and payout.
-- Live CAD collect is Nomba Checkout (card + Interac e-Transfer) with Fincra Autodeposit failover.
-- CAD payout stays Nomba + Fincra.

UPDATE public.corridor_rail_policies
SET
  preferred_partner = CASE
    WHEN preferred_partner IN ('wise', 'dodo') THEN 'nomba'
    ELSE preferred_partner
  END,
  failover_partners = ARRAY(
    SELECT x FROM unnest(failover_partners) AS x
    WHERE x NOT IN ('wise', 'dodo')
  ),
  notes = CASE
    WHEN direction = 'collect' THEN
      'CAD collect: Nomba Checkout (card + Interac e-Transfer, instant) → Fincra Autodeposit. No Wise or Dodo.'
    ELSE notes
  END,
  updated_at = now()
WHERE currency_code = 'CAD';

UPDATE public.corridor_rail_policies
SET
  failover_partners = ARRAY['interac']::text[],
  preferred_partner = 'nomba',
  enabled = true,
  notes = 'CAD collect: Nomba Checkout (card + Interac e-Transfer, instant) → Fincra Autodeposit. No Wise or Dodo.',
  updated_at = now()
WHERE direction = 'collect'
  AND currency_code = 'CAD';

UPDATE public.payment_partners
SET
  supported_currencies = ARRAY(
    SELECT x FROM unnest(supported_currencies) AS x
    WHERE x <> 'CAD'
  ),
  supported_countries = ARRAY(
    SELECT x FROM unnest(supported_countries) AS x
    WHERE x <> 'CA'
  ),
  settlement_currency = CASE
    WHEN code = 'wise' AND settlement_currency = 'CAD' THEN 'USD'
    ELSE settlement_currency
  END,
  updated_at = now()
WHERE code IN ('wise', 'dodo');

UPDATE public.partner_corridors c
SET
  enabled = false,
  live_routing_enabled = false,
  updated_at = now()
FROM public.payment_partners p
WHERE c.partner_id = p.id
  AND p.code IN ('wise', 'dodo')
  AND (
    coalesce(c.source_currency, '') = 'CAD'
    OR coalesce(c.dest_currency, '') = 'CAD'
    OR coalesce(c.source_country, '') = 'CA'
    OR coalesce(c.dest_country, '') = 'CA'
  );

NOTIFY pgrst, 'reload schema';
