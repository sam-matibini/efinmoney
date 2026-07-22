-- Fincra settlement + liability accounts for NGN/Africa top-ups.
-- Uses 128x codes to avoid collisions with Stripe 1250 / Nomba 1255–1258 / Ghana 1254.

INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system, description)
SELECT v.code, v.name, 'asset', v.currency, true, true, v.description
FROM (VALUES
  ('1280', 'Fincra Settlement - NGN', 'NGN', 'Funds held by Fincra from customer top-ups (NGN)'),
  ('1281', 'Fincra Settlement - KES', 'KES', 'Funds held by Fincra from customer top-ups (KES)'),
  ('1282', 'Fincra Settlement - UGX', 'UGX', 'Funds held by Fincra from customer top-ups (UGX)'),
  ('1283', 'Fincra Settlement - GHS', 'GHS', 'Funds held by Fincra from customer top-ups (GHS)'),
  ('1284', 'Fincra Settlement - ZMW', 'ZMW', 'Funds held by Fincra from customer top-ups (ZMW)'),
  ('1285', 'Fincra Settlement - RWF', 'RWF', 'Funds held by Fincra from customer top-ups (RWF)'),
  ('1286', 'Fincra Settlement - TZS', 'TZS', 'Funds held by Fincra from customer top-ups (TZS)'),
  ('1287', 'Fincra Settlement - USD', 'USD', 'Funds held by Fincra from customer top-ups (USD)'),
  ('1288', 'Fincra Settlement - CAD', 'CAD', 'Funds held by Fincra from customer top-ups (CAD)'),
  ('1289', 'Fincra Settlement - EUR', 'EUR', 'Funds held by Fincra from customer top-ups (EUR)'),
  ('1290', 'Fincra Settlement - GBP', 'GBP', 'Funds held by Fincra from customer top-ups (GBP)'),
  ('1291', 'Fincra Settlement - ZAR', 'ZAR', 'Funds held by Fincra from customer top-ups (ZAR)'),
  ('1292', 'Fincra Settlement - XAF', 'XAF', 'Funds held by Fincra from customer top-ups (XAF)'),
  ('1293', 'Fincra Settlement - XOF', 'XOF', 'Funds held by Fincra from customer top-ups (XOF)'),
  ('1294', 'Fincra Settlement - MWK', 'MWK', 'Funds held by Fincra from customer top-ups (MWK)')
) AS v(code, name, currency, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ledger_accounts la
  WHERE la.code = v.code OR la.name = v.name
);

INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
SELECT v.code, v.name, 'liability', v.currency, true, true
FROM (VALUES
  ('2102', 'Customer Wallet Liability - NGN', 'NGN'),
  ('2104', 'Customer Wallet Liability - EUR', 'EUR'),
  ('2105', 'Customer Wallet Liability - GBP', 'GBP'),
  ('2106', 'Customer Wallet Liability - GHS', 'GHS'),
  ('2107', 'Customer Wallet Liability - TZS', 'TZS'),
  ('2108', 'Customer Wallet Liability - ZMW', 'ZMW'),
  ('2110', 'Customer Wallet Liability - KES', 'KES'),
  ('2111', 'Customer Wallet Liability - UGX', 'UGX'),
  ('2112', 'Customer Wallet Liability - RWF', 'RWF'),
  ('2113', 'Customer Wallet Liability - ZAR', 'ZAR'),
  ('2114', 'Customer Wallet Liability - XAF', 'XAF'),
  ('2115', 'Customer Wallet Liability - XOF', 'XOF'),
  ('2116', 'Customer Wallet Liability - MWK', 'MWK')
) AS v(code, name, currency)
WHERE NOT EXISTS (
  SELECT 1 FROM public.ledger_accounts la
  WHERE la.code = v.code OR (la.currency_code = v.currency AND la.name ILIKE 'Customer Wallet Liability%')
);
