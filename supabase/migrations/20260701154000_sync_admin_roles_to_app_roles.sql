-- Root cause of "Trial Balance won't balance for the Super Admin":
-- the app has TWO parallel role systems that were never wired together.
--   * admin_users (admin_user_role enum) — what the admin PORTAL authorizes on.
--   * user_roles  (app_role enum)        — what every database RLS policy checks
--                                          via has_role().
-- Admins were seeded into admin_users but never into user_roles, so at the DB
-- level a super_admin had no more read access than an ordinary customer. The
-- ledger_entries RLS only exposes rows whose wallet_id belongs to the caller OR
-- where the caller holds 'admin'/'finance'. The balancing legs (Bank Trust, FX
-- Clearing, Settlement) all have wallet_id = NULL, so they were invisible to
-- admins — making the per-currency Trial Balance look permanently unbalanced in
-- the browser even though the underlying ledger is balanced.
--
-- Fix: map each active admin's portal role to the equivalent app_role(s), backfill
-- existing admins, and keep the two in sync via a trigger going forward.

-- Which app_roles each portal role grants (active admins only).
CREATE OR REPLACE FUNCTION public.app_roles_for_admin_role(_role public.admin_user_role)
RETURNS public.app_role[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _role
    WHEN 'super_admin'        THEN ARRAY['admin','compliance','finance']::public.app_role[]
    WHEN 'compliance_officer' THEN ARRAY['compliance']::public.app_role[]
    WHEN 'finance_officer'    THEN ARRAY['finance']::public.app_role[]
    WHEN 'support_agent'      THEN ARRAY['support']::public.app_role[]
    ELSE ARRAY[]::public.app_role[]   -- viewer: portal view only, no elevated DB role
  END
$$;

-- Reconcile one admin's staff app_roles to match their current portal role+status.
-- Only ever touches the four staff app_roles — never 'user' (which every account
-- gets at signup and which must not be revoked here).
CREATE OR REPLACE FUNCTION public.sync_admin_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desired public.app_role[];
  v_managed public.app_role[] := ARRAY['admin','compliance','finance','support']::public.app_role[];
BEGIN
  IF NEW.status = 'active' THEN
    v_desired := public.app_roles_for_admin_role(NEW.role);
  ELSE
    v_desired := ARRAY[]::public.app_role[];  -- suspended/invited/rejected get no staff DB access
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  SELECT NEW.id, unnest(v_desired)
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles
   WHERE user_id = NEW.id
     AND role = ANY(v_managed)
     AND role <> ALL(v_desired);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_admin_user_roles ON public.admin_users;
CREATE TRIGGER trg_sync_admin_user_roles
AFTER INSERT OR UPDATE OF role, status ON public.admin_users
FOR EACH ROW EXECUTE FUNCTION public.sync_admin_user_roles();

-- Backfill every currently-active admin.
INSERT INTO public.user_roles (user_id, role)
SELECT au.id, unnest(public.app_roles_for_admin_role(au.role))
  FROM public.admin_users au
 WHERE au.status = 'active'
ON CONFLICT (user_id, role) DO NOTHING;
