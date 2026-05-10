
CREATE POLICY "Admins can read own admin row"
ON public.admin_users
FOR SELECT
TO authenticated
USING (id = auth.uid());
