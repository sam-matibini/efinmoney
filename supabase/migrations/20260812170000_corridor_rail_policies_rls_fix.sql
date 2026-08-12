-- Fix corridor_rail_policies access for admin portal (403 on save/list).
-- Root causes: authenticated lacked INSERT/UPDATE/DELETE; RLS should match pricing helpers.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.corridor_rail_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.corridor_rail_policy_audit TO authenticated;
GRANT ALL ON public.corridor_rail_policies TO service_role;
GRANT ALL ON public.corridor_rail_policy_audit TO service_role;

DROP POLICY IF EXISTS corridor_rail_policies_select ON public.corridor_rail_policies;
CREATE POLICY corridor_rail_policies_select
  ON public.corridor_rail_policies FOR SELECT TO authenticated
  USING (
    enabled = true
    OR public.is_pricing_manager(auth.uid())
    OR public.is_admin_user(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
  );

DROP POLICY IF EXISTS corridor_rail_policies_write ON public.corridor_rail_policies;
CREATE POLICY corridor_rail_policies_insert
  ON public.corridor_rail_policies FOR INSERT TO authenticated
  WITH CHECK (
    public.is_pricing_manager(auth.uid())
    OR public.is_admin_user(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
  );

CREATE POLICY corridor_rail_policies_update
  ON public.corridor_rail_policies FOR UPDATE TO authenticated
  USING (
    public.is_pricing_manager(auth.uid())
    OR public.is_admin_user(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
  )
  WITH CHECK (
    public.is_pricing_manager(auth.uid())
    OR public.is_admin_user(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
  );

CREATE POLICY corridor_rail_policies_delete
  ON public.corridor_rail_policies FOR DELETE TO authenticated
  USING (
    public.is_pricing_manager(auth.uid())
    OR public.is_admin_user(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
  );

DROP POLICY IF EXISTS corridor_rail_policy_audit_select ON public.corridor_rail_policy_audit;
CREATE POLICY corridor_rail_policy_audit_select
  ON public.corridor_rail_policy_audit FOR SELECT TO authenticated
  USING (
    public.is_pricing_manager(auth.uid())
    OR public.is_admin_user(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
  );

DROP POLICY IF EXISTS corridor_rail_policy_audit_write ON public.corridor_rail_policy_audit;
CREATE POLICY corridor_rail_policy_audit_insert
  ON public.corridor_rail_policy_audit FOR INSERT TO authenticated
  WITH CHECK (
    public.is_pricing_manager(auth.uid())
    OR public.is_admin_user(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'finance'::public.app_role)
  );

NOTIFY pgrst, 'reload schema';
