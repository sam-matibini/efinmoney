-- Bambora / Worldline NAM settlement accounts for CAD (and USD spare)
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
VALUES
  ('1364', 'Bambora Settlement CAD', 'asset', 'CAD', true, true),
  ('1365', 'Bambora Settlement USD', 'asset', 'USD', true, true)
ON CONFLICT (code) DO NOTHING;
