-- Manual credit: 5000 UGX to ukwenzyb@gmail.com
-- Run in Supabase SQL editor (project dkdnwumllibwdlqbjkwy) or:
--   npx supabase db query --linked --experimental -f scripts/manual-credit-ugx-ukwenzyb.sql --yes

DO $$
DECLARE
  v_user_id uuid;
  v_wallet_id uuid;
  v_asset_id uuid;
  v_liab_id uuid;
  v_journal uuid := gen_random_uuid();
  v_ref uuid := gen_random_uuid();
  v_amount numeric := 5000;
  v_bal numeric;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower('ukwenzyb@gmail.com')
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found: ukwenzyb@gmail.com';
  END IF;

  SELECT id INTO v_wallet_id
  FROM public.wallets
  WHERE user_id = v_user_id AND currency_code = 'UGX'
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_id, currency_code, status)
    VALUES (v_user_id, 'UGX', 'active')
    RETURNING id INTO v_wallet_id;
  END IF;

  -- Prefer Paytota UGX settlement; fall back to Flutterwave UGX settlement
  SELECT id INTO v_asset_id FROM public.ledger_accounts WHERE code = '1280' LIMIT 1;
  IF v_asset_id IS NULL THEN
    SELECT id INTO v_asset_id FROM public.ledger_accounts WHERE code = '1233' LIMIT 1;
  END IF;
  IF v_asset_id IS NULL THEN
    INSERT INTO public.ledger_accounts (code, name, account_type, currency_code, is_active, is_system)
    VALUES ('1280', 'Paytota Settlement - UGX', 'asset', 'UGX', true, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_asset_id;
  END IF;

  SELECT id INTO v_liab_id FROM public.ledger_accounts WHERE code = '2111' LIMIT 1;
  IF v_liab_id IS NULL THEN
    RAISE EXCEPTION 'Missing liability account 2111 (UGX wallet liability)';
  END IF;

  INSERT INTO public.ledger_entries (
    journal_id, account_id, wallet_id, currency_code,
    debit_amount, credit_amount, description,
    reference_type, reference_id, created_by
  ) VALUES
  (
    v_journal, v_asset_id, NULL, 'UGX',
    v_amount, 0,
    'Manual top-up UGX (ops credit for testing)',
    'manual_topup', v_ref, v_user_id
  ),
  (
    v_journal, v_liab_id, v_wallet_id, 'UGX',
    0, v_amount,
    'Manual top-up UGX (ops credit for testing)',
    'manual_topup', v_ref, v_user_id
  );

  SELECT public.get_wallet_balance(v_wallet_id) INTO v_bal;

  RAISE NOTICE 'OK: credited % UGX to wallet % for user %. New balance: %',
    v_amount, v_wallet_id, v_user_id, v_bal;
END $$;

SELECT
  u.email,
  w.id AS wallet_id,
  w.currency_code,
  public.get_wallet_balance(w.id) AS balance
FROM auth.users u
JOIN public.wallets w ON w.user_id = u.id AND w.currency_code = 'UGX'
WHERE lower(u.email) = lower('ukwenzyb@gmail.com');
