
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_system, is_active)
VALUES
  ('1245', 'Stripe Settlement - NGN', 'asset', 'NGN', true, true),
  ('1246', 'Stripe Settlement - KES', 'asset', 'KES', true, true),
  ('1247', 'Stripe Settlement - UGX', 'asset', 'UGX', true, true),
  ('1248', 'Stripe Settlement - ZMW', 'asset', 'ZMW', true, true),
  ('1249', 'Stripe Settlement - GHS', 'asset', 'GHS', true, true),
  ('1250', 'Stripe Settlement - TZS', 'asset', 'TZS', true, true)
ON CONFLICT (code) DO NOTHING;
