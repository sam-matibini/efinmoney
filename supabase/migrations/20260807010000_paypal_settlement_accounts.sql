-- PayPal / Braintree settlement assets (1370+) — avoid Square 1360 / Wise 1320 / Dodo 1295.
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
VALUES
  ('1370', 'PayPal Settlement USD', 'asset', 'USD', true, true),
  ('1371', 'PayPal Settlement CAD', 'asset', 'CAD', true, true),
  ('1372', 'PayPal Settlement EUR', 'asset', 'EUR', true, true),
  ('1373', 'PayPal Settlement GBP', 'asset', 'GBP', true, true)
ON CONFLICT (code) DO NOTHING;
