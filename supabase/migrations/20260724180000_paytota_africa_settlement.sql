-- Paytota East Africa MoMo settlement assets (UGX / KES / RWF).
-- Dedicated codes 1280–1282 to avoid Swychr/Paytota Western 127x collisions.
INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
VALUES
  ('1280', 'Paytota Settlement - UGX', 'asset', 'UGX', true, true),
  ('1281', 'Paytota Settlement - KES', 'asset', 'KES', true, true),
  ('1282', 'Paytota Settlement - RWF', 'asset', 'RWF', true, true)
ON CONFLICT (code) DO NOTHING;
