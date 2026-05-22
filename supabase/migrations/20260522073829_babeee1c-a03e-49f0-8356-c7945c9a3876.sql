INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active)
SELECT '1207', 'PawaPay Settlement', 'asset', 'USD', true
WHERE NOT EXISTS (SELECT 1 FROM public.ledger_accounts WHERE code = '1207');