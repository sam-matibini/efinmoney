
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_system, is_active, description)
VALUES
  ('1230', 'Flutterwave Settlement - USD', 'asset', 'USD', true, true, 'Funds held by Flutterwave from customer top-ups (USD)'),
  ('1231', 'Flutterwave Settlement - NGN', 'asset', 'NGN', true, true, 'Funds held by Flutterwave from customer top-ups (NGN)'),
  ('1232', 'Flutterwave Settlement - KES', 'asset', 'KES', true, true, 'Funds held by Flutterwave from customer top-ups (KES)'),
  ('1233', 'Flutterwave Settlement - UGX', 'asset', 'UGX', true, true, 'Funds held by Flutterwave from customer top-ups (UGX)'),
  ('1234', 'Flutterwave Settlement - GHS', 'asset', 'GHS', true, true, 'Funds held by Flutterwave from customer top-ups (GHS)'),
  ('1235', 'Flutterwave Settlement - ZMW', 'asset', 'ZMW', true, true, 'Funds held by Flutterwave from customer top-ups (ZMW)'),
  ('1236', 'Flutterwave Settlement - RWF', 'asset', 'RWF', true, true, 'Funds held by Flutterwave from customer top-ups (RWF)'),
  ('1237', 'Flutterwave Settlement - TZS', 'asset', 'TZS', true, true, 'Funds held by Flutterwave from customer top-ups (TZS)'),
  ('1238', 'Flutterwave Settlement - EUR', 'asset', 'EUR', true, true, 'Funds held by Flutterwave from customer top-ups (EUR)'),
  ('1239', 'Flutterwave Settlement - GBP', 'asset', 'GBP', true, true, 'Funds held by Flutterwave from customer top-ups (GBP)'),
  ('1240', 'Flutterwave Settlement - CAD', 'asset', 'CAD', true, true, 'Funds held by Flutterwave from customer top-ups (CAD)')
ON CONFLICT (code) DO NOTHING;
