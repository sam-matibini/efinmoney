-- Verify the admin->app_role backfill worked: every active admin should now hold
-- the mapped staff app_roles, and Samuel (super_admin) should have admin/finance/
-- compliance so the ledger_entries RLS exposes the full trial balance to him.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT au.email, au.role::text AS portal_role, au.status::text AS status,
           COALESCE(array_agg(ur.role::text ORDER BY ur.role::text)
                    FILTER (WHERE ur.role IS NOT NULL), ARRAY[]::text[]) AS app_roles
      FROM public.admin_users au
      LEFT JOIN public.user_roles ur ON ur.user_id = au.id
     GROUP BY au.email, au.role, au.status
     ORDER BY au.role
  LOOP
    RAISE NOTICE 'admin % [% / %] -> app_roles %', r.email, r.portal_role, r.status, r.app_roles;
  END LOOP;
END $$;
