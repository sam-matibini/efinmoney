-- Dedicated Interac Autodeposit email on the profile, separate from login email.
-- Nomba Interac payouts must not use the eFinMoney login mailbox.

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

NOTIFY pgrst, 'reload schema';
