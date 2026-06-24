-- Payment link escrow: unique ledger account codes per currency (code is UNIQUE globally).
-- Earlier seed tried multiple rows with code 2199 — only one currency could exist.

INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active)
VALUES
  ('2199', 'Payouts Pending Claim - CAD', 'liability', 'CAD', true),
  ('2201', 'Payouts Pending Claim - USD', 'liability', 'USD', true),
  ('2202', 'Payouts Pending Claim - EUR', 'liability', 'EUR', true),
  ('2203', 'Payouts Pending Claim - GBP', 'liability', 'GBP', true)
ON CONFLICT (code) DO NOTHING;
