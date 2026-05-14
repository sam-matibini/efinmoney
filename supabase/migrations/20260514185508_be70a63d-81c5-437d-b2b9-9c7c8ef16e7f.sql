
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_system, is_active, description)
VALUES
  ('1202', 'Stripe Settlement - USD', 'asset', 'USD', true, true, 'Funds held by Stripe from customer card top-ups (USD)'),
  ('1242', 'Stripe Settlement - CAD', 'asset', 'CAD', true, true, 'Funds held by Stripe from customer card top-ups (CAD)'),
  ('1243', 'Stripe Settlement - EUR', 'asset', 'EUR', true, true, 'Funds held by Stripe from customer card top-ups (EUR)'),
  ('1244', 'Stripe Settlement - GBP', 'asset', 'GBP', true, true, 'Funds held by Stripe from customer card top-ups (GBP)')
ON CONFLICT (code) DO NOTHING;
