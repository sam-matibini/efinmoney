-- Fincra settlement clearing accounts (mirror Flutterwave 123x series)
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system, description)
SELECT v.code, v.name, 'asset', v.currency, true, true, v.description
FROM (VALUES
  ('1250', 'Fincra Settlement - NGN', 'NGN', 'Funds held by Fincra from customer top-ups (NGN)'),
  ('1251', 'Fincra Settlement - KES', 'KES', 'Funds held by Fincra from customer top-ups (KES)'),
  ('1252', 'Fincra Settlement - UGX', 'UGX', 'Funds held by Fincra from customer top-ups (UGX)'),
  ('1253', 'Fincra Settlement - GHS', 'GHS', 'Funds held by Fincra from customer top-ups (GHS)'),
  ('1254', 'Fincra Settlement - ZMW', 'ZMW', 'Funds held by Fincra from customer top-ups (ZMW)'),
  ('1255', 'Fincra Settlement - RWF', 'RWF', 'Funds held by Fincra from customer top-ups (RWF)'),
  ('1256', 'Fincra Settlement - TZS', 'TZS', 'Funds held by Fincra from customer top-ups (TZS)'),
  ('1257', 'Fincra Settlement - USD', 'USD', 'Funds held by Fincra from customer top-ups (USD)'),
  ('1258', 'Fincra Settlement - CAD', 'CAD', 'Funds held by Fincra from customer top-ups (CAD)')
) AS v(code, name, currency, description)
WHERE NOT EXISTS (SELECT 1 FROM public.ledger_accounts la WHERE la.code = v.code);
