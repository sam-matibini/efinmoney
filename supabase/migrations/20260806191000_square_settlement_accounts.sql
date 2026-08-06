-- Square Web Payments settlement assets (1360+) — avoid Wise 1320–1349 / Dodo 1295 / tax 1350+.
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
VALUES
  ('1360', 'Square Settlement USD', 'asset', 'USD', true, true),
  ('1361', 'Square Settlement CAD', 'asset', 'CAD', true, true),
  ('1362', 'Square Settlement EUR', 'asset', 'EUR', true, true),
  ('1363', 'Square Settlement GBP', 'asset', 'GBP', true, true)
ON CONFLICT (code) DO NOTHING;
