
CREATE OR REPLACE FUNCTION public.is_super_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = _uid AND role = 'super_admin'::admin_user_role
  );
$$;

DROP POLICY IF EXISTS "Super admins manage admin_users" ON public.admin_users;

CREATE POLICY "Super admins manage admin_users"
  ON public.admin_users
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
