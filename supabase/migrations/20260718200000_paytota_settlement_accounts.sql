-- Paytota settlement asset accounts (same-currency card collect, including CAD)

INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
VALUES
  ('1270', 'Paytota Settlement - USD', 'asset', 'USD', true, true),
  ('1271', 'Paytota Settlement - CAD', 'asset', 'CAD', true, true),
  ('1272', 'Paytota Settlement - EUR', 'asset', 'EUR', true, true),
  ('1273', 'Paytota Settlement - GBP', 'asset', 'GBP', true, true)
ON CONFLICT (code) DO NOTHING;
