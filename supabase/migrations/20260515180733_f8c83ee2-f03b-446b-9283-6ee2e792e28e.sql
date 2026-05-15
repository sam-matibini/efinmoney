INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_system, is_active, description)
VALUES ('1203', 'Paysafe Settlement - CAD', 'asset', 'CAD', true, true, 'Clearing account for funds in transit to recipients via Paysafe (Interac e-Transfer / EFT). Credited when a Canadian payout is initiated; reduced when Paysafe confirms settlement.')
ON CONFLICT (code) DO NOTHING;