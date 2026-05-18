INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_system, is_active, description)
VALUES ('1206', 'MTN Settlement', 'asset', NULL, true, true, 'Clearing account for MTN MoMo remittance payouts in transit')
ON CONFLICT (code) DO NOTHING;