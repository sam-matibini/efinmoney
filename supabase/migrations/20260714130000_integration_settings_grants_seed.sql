-- Grant explicit table-level access (RLS alone is not enough if default grants were ever revoked)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_settings TO service_role;

-- Seed all 6 integration rows so nothing shows "Not Configured"
INSERT INTO public.integration_settings (key, is_enabled, config) VALUES
  ('flutterwave', false, '{}'),
  ('stripe',      false, '{}'),
  ('paysafe',     false, '{}'),
  ('plaid',       false, '{}'),
  ('persona',     false, '{}'),
  ('mpesa',       false, '{}')
ON CONFLICT (key) DO NOTHING;
