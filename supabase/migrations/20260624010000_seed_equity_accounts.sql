-- Seed standard equity accounts (3xxx range) into ledger_accounts.
-- These were missing, causing the balance sheet to show "0 accounts"
-- under Equity and a permanent imbalance warning.

INSERT INTO public.ledger_accounts (code, name, account_type, is_system, is_active, description)
VALUES
  ('3000', 'Share Capital',              'equity', true, true, 'Issued and paid-up share capital'),
  ('3100', 'Additional Paid-in Capital', 'equity', true, true, 'Capital contributed above par value'),
  ('3200', 'Retained Earnings',          'equity', true, true, 'Cumulative net income retained in the business'),
  ('3300', 'Current Year Earnings',      'equity', true, true, 'Net income for the current financial year'),
  ('3900', 'Owner''s Equity / Drawings', 'equity', true, true, 'Owner drawings or proprietorship equity')
ON CONFLICT (code) DO NOTHING;
