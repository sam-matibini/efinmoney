INSERT INTO public.ledger_accounts (code, name, description, account_type, currency_code, is_system, is_active)
SELECT '1205', 'Elicate Settlement - ZMW', 'Clearing account for ZMW payouts via Elicate Pay', 'asset', 'ZMW', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.ledger_accounts WHERE code = '1205');