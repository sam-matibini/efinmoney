ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS provider_charge_id text;

INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active)
SELECT '1102', 'Stripe Card Receivable - CAD', 'asset', 'CAD', true
WHERE NOT EXISTS (SELECT 1 FROM public.ledger_accounts WHERE code = '1102');