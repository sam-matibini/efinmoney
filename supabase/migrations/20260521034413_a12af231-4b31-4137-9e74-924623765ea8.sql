
CREATE UNIQUE INDEX IF NOT EXISTS profiles_account_number_unique
  ON public.profiles (account_number)
  WHERE account_number IS NOT NULL;
