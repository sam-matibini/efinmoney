-- Seed partner_liquidity with a zero-balance row for every enabled
-- (partner_id, dest_currency) pair in partner_corridors that doesn't
-- already have a matching liquidity entry.
-- Balances stay at 0 until manually updated or the API refresh runs.
INSERT INTO partner_liquidity (
  partner_id,
  currency_code,
  available_balance,
  required_reserve,
  daily_utilized,
  source,
  as_of
)
SELECT DISTINCT
  pc.partner_id,
  pc.dest_currency,
  0,
  0,
  0,
  'manual'::pricing_source,
  now()
FROM partner_corridors pc
WHERE pc.enabled = true
ON CONFLICT (partner_id, currency_code) DO NOTHING;
