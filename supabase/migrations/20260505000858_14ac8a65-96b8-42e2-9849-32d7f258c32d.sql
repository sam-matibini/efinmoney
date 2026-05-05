INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_system, is_active)
VALUES
  ('2122', 'Mobile Money Payable - TZS', 'liability', 'TZS', true, true),
  ('2123', 'Mobile Money Payable - ZMW', 'liability', 'ZMW', true, true),
  ('2124', 'Mobile Money Payable - BIF', 'liability', 'BIF', true, true),
  ('2125', 'Mobile Money Payable - NGN', 'liability', 'NGN', true, true)
ON CONFLICT DO NOTHING;