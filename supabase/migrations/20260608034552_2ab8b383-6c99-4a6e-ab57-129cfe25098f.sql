GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_connected_accounts TO authenticated;
GRANT ALL ON public.stripe_connected_accounts TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stripe_connected_accounts'
      AND policyname = 'Users can update own connected account'
  ) THEN
    CREATE POLICY "Users can update own connected account"
      ON public.stripe_connected_accounts
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
      WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  END IF;
END
$$;