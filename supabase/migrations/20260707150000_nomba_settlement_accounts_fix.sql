-- Nomba settlement accounts (126x — avoid Fincra 125x codes)

INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
VALUES
  ('1260', 'Nomba Settlement - NGN', 'asset', 'NGN', true, true),
  ('1261', 'Nomba Settlement - USD', 'asset', 'USD', true, true),
  ('1262', 'Nomba Settlement - EUR', 'asset', 'EUR', true, true),
  ('1263', 'Nomba Settlement - GBP', 'asset', 'GBP', true, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  currency_code = EXCLUDED.currency_code,
  account_type = EXCLUDED.account_type,
  is_active = EXCLUDED.is_active,
  is_system = EXCLUDED.is_system;
