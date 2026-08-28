-- Nomba as preferred payout rail for every corridor Nomba supports (Zambia stays Fincra).

INSERT INTO public.corridor_rail_policies (
  direction,
  country_code,
  currency_code,
  preferred_partner,
  failover_partners,
  enabled,
  notes
)
VALUES
  ('payout', 'NG', 'NGN', 'nomba', ARRAY['fincra', 'flovide', 'flutterwave', 'swychr'], true, 'Nomba NGN bank default'),
  ('payout', 'GH', 'GHS', 'nomba', ARRAY['fincra', 'flovide', 'flutterwave'], true, 'Nomba Global Payout MoMo default'),
  ('payout', 'KE', 'KES', 'nomba', ARRAY['fincra', 'flovide', 'flutterwave', 'paytota'], true, 'Nomba Global Payout MoMo default'),
  ('payout', 'UG', 'UGX', 'nomba', ARRAY['fincra', 'flovide', 'flutterwave', 'paytota'], true, 'Nomba Global Payout MoMo default'),
  ('payout', 'TZ', 'TZS', 'nomba', ARRAY['fincra', 'flutterwave'], true, 'Nomba Global Payout MoMo default'),
  ('payout', 'RW', 'RWF', 'nomba', ARRAY['fincra', 'flutterwave', 'paytota'], true, 'Nomba Global Payout MoMo default'),
  ('payout', 'ZM', 'ZMW', 'fincra', ARRAY['elicate', 'flutterwave'], true, 'Zambia — Nomba unsupported'),
  ('payout', 'CA', 'CAD', 'nomba', ARRAY['flovide'], true, 'Nomba Global Payout CAD default'),
  ('payout', 'GB', 'GBP', 'nomba', ARRAY['flutterwave'], true, 'Nomba Global Payout GBP default'),
  ('payout', 'US', 'USD', 'nomba', ARRAY['flutterwave'], true, 'Nomba Global Payout USD default')
ON CONFLICT (direction, country_code, currency_code) DO UPDATE SET
  preferred_partner = EXCLUDED.preferred_partner,
  failover_partners = EXCLUDED.failover_partners,
  enabled = EXCLUDED.enabled,
  notes = EXCLUDED.notes,
  updated_at = now();
