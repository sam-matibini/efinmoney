-- Run in Supabase Dashboard → SQL Editor (project dkdnwumllibwdlqbjkwy)
-- Checks whether virtual card creation prerequisites exist.

SELECT 'cards.balance column' AS check_name,
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'cards' AND column_name = 'balance'
       ) AS ok;

SELECT 'cards.currency_code column' AS check_name,
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'cards' AND column_name = 'currency_code'
       ) AS ok;

SELECT 'card_secrets table' AS check_name,
       EXISTS (
         SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'card_secrets'
       ) AS ok;

SELECT 'virtual_card_transfers table' AS check_name,
       EXISTS (
         SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'virtual_card_transfers'
       ) AS ok;

SELECT 'CAD wallet liability (2101)' AS check_name,
       EXISTS (
         SELECT 1 FROM public.ledger_accounts WHERE code = '2101' AND currency_code = 'CAD'
       ) AS ok;

SELECT 'Pending transfers float (2200)' AS check_name,
       EXISTS (
         SELECT 1 FROM public.ledger_accounts WHERE code = '2200'
       ) AS ok;

-- All rows should show ok = true. If any is false, run production-sql.sql sections 5–6
-- and ensure ledger_accounts includes 2101 (CAD) from initial chart-of-accounts migration.
