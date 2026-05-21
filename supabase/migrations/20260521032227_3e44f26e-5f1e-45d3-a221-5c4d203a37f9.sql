
-- 1) Add efin_tag column to profiles (case-insensitive unique)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS efin_tag text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_efin_tag_lower_uidx
  ON public.profiles (lower(efin_tag))
  WHERE efin_tag IS NOT NULL;

-- Validate format: 3-20 chars, alphanumeric + underscore, must start with letter
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_efin_tag_format_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_efin_tag_format_chk
  CHECK (efin_tag IS NULL OR efin_tag ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$');

-- 2) Secure lookup RPC: returns at most one match for an exact email or efin_tag.
-- Uses SECURITY DEFINER + rate limit to prevent enumeration.
CREATE OR REPLACE FUNCTION public.lookup_efin_recipient(p_query text)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  efin_tag text,
  avatar_url text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query text;
  v_caller uuid := auth.uid();
  v_rl_key text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_query := lower(btrim(coalesce(p_query, '')));
  IF length(v_query) < 3 THEN
    RETURN;
  END IF;

  -- Rate limit lookups: 30 per minute per user
  v_rl_key := 'efin_lookup:' || v_caller::text;
  IF NOT public.check_rate_limit(v_rl_key, 30, 60) THEN
    RAISE EXCEPTION 'Too many lookups, please slow down';
  END IF;

  -- Strip leading @ for tag lookup
  IF left(v_query, 1) = '@' THEN
    v_query := substring(v_query from 2);
  END IF;

  RETURN QUERY
    SELECT p.user_id,
           p.full_name::text,
           p.efin_tag::text,
           p.avatar_url::text,
           p.email::text
      FROM public.profiles p
     WHERE p.user_id <> v_caller
       AND (
         lower(p.email) = v_query
         OR lower(p.efin_tag) = v_query
       )
     LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_efin_recipient(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_efin_recipient(text) TO authenticated;
