-- Ensure profiles.interac_email exists, is writable, and PostgREST can see it.
-- The prior migration added the column without NOTIFY/grants, so the Data API
-- reported "Could not find the 'interac_email' column of 'profiles' in the schema cache".

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interac_email text;

COMMENT ON COLUMN public.profiles.interac_email IS
  'Canadian Interac Autodeposit address for Nomba CAD payouts. Must differ from profiles.email (login).';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_interac_email_lower_idx
  ON public.profiles (lower(interac_email))
  WHERE interac_email IS NOT NULL AND btrim(interac_email) <> '';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_interac_email_differs_from_login;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_interac_email_differs_from_login
  CHECK (
    interac_email IS NULL
    OR btrim(interac_email) = ''
    OR email IS NULL
    OR lower(btrim(interac_email)) <> lower(btrim(email))
  );

GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.update_own_interac_email(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_login text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  SELECT lower(btrim(email)) INTO v_login
  FROM public.profiles
  WHERE user_id = auth.uid();
  IF v_email IS NOT NULL AND v_login IS NOT NULL AND v_email = v_login THEN
    RAISE EXCEPTION 'Interac email must differ from your login email';
  END IF;
  UPDATE public.profiles
     SET interac_email = v_email, updated_at = now()
   WHERE user_id = auth.uid();
  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_interac_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_interac_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_interac_email(text) TO service_role;

NOTIFY pgrst, 'reload schema';
