INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_system, is_active)
VALUES
  ('2102', 'Customer Wallet Liability - NGN', 'liability', 'NGN', true, true),
  ('2103', 'Customer Wallet Liability - SOS', 'liability', 'SOS', true, true),
  ('2104', 'Customer Wallet Liability - EUR', 'liability', 'EUR', true, true),
  ('2105', 'Customer Wallet Liability - GBP', 'liability', 'GBP', true, true),
  ('2106', 'Customer Wallet Liability - GHS', 'liability', 'GHS', true, true),
  ('2107', 'Customer Wallet Liability - TZS', 'liability', 'TZS', true, true),
  ('2108', 'Customer Wallet Liability - ZMW', 'liability', 'ZMW', true, true)
ON CONFLICT DO NOTHING;