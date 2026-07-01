-- Diagnostic: the Trial Balance in the browser shows ONLY the 3 wallet-linked
-- liability accounts (2100/2101/2102), never the Bank Trust / FX Clearing /
-- Settlement legs. Those legs have wallet_id = NULL. The RLS SELECT policy on
-- ledger_entries only lets a user see rows where wallet_id belongs to them OR
-- they hold the 'admin'/'finance' app_role. Confirm: (a) how many entries are
-- wallet_id NULL (invisible to a non-privileged user), and (b) what roles the
-- admin user Samuel actually holds, since "Super Admin" is not an app_role value.
DO $$
DECLARE
  v_null_wallet bigint;
  v_not_null_wallet bigint;
  r RECORD;
BEGIN
  SELECT count(*) FILTER (WHERE wallet_id IS NULL),
         count(*) FILTER (WHERE wallet_id IS NOT NULL)
    INTO v_null_wallet, v_not_null_wallet
    FROM public.ledger_entries;
  RAISE NOTICE 'ledger_entries: wallet_id NULL=% (hidden from non-priv users), NOT NULL=%', v_null_wallet, v_not_null_wallet;

  FOR r IN
    SELECT u.email, array_agg(ur.role::text ORDER BY ur.role::text) AS roles
      FROM auth.users u
      LEFT JOIN public.user_roles ur ON ur.user_id = u.id
     WHERE u.email ILIKE '%egwu%' OR u.email ILIKE '%samuel%'
     GROUP BY u.email
  LOOP
    RAISE NOTICE 'user % has app_roles: %', r.email, r.roles;
  END LOOP;
END $$;
