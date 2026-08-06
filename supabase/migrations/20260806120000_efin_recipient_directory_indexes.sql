-- Speed up the eFinMoney recipient picker on the Send page.
-- Goal: <20ms list, <10ms typeahead, no full table scan.

-- 1) Trigram indexes so prefix + substring searches on tag and name use an index.
--    pg_trgm is already enabled (see DATABASE_SCHEMA.sql:23).
CREATE INDEX IF NOT EXISTS profiles_efin_tag_lower_trgm_idx
  ON public.profiles USING gin (lower(efin_tag) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_full_name_lower_trgm_idx
  ON public.profiles USING gin (lower(full_name) gin_trgm_ops);

-- 2) Replace list_efin_recipients: drop the coalesce that was blocking the
--    unique partial index, restrict to tag-havers when p_query is empty,
--    and raise the cap to 200 so one call is enough for the directory.
CREATE OR REPLACE FUNCTION public.list_efin_recipients(p_query text DEFAULT '', p_limit int DEFAULT 200, p_offset int DEFAULT 0)
RETURNS TABLE(user_id uuid, full_name text, efin_tag text, avatar_url text, email_masked text, account_number text, base_currency text)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_query text;
  v_digits text;
  v_limit int := least(greatest(coalesce(p_limit, 200), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.check_rate_limit('efin_list:' || v_caller::text, 240, 60) THEN
    RAISE EXCEPTION 'Too many lookups, please slow down';
  END IF;

  v_query := lower(btrim(coalesce(p_query, '')));
  IF left(v_query, 1) = '@' THEN
    v_query := substring(v_query from 2);
  END IF;
  v_digits := regexp_replace(v_query, '\D', '', 'g');

  RETURN QUERY
  SELECT
    p.user_id,
    p.full_name::text,
    p.efin_tag::text,
    p.avatar_url::text,
    CASE
      WHEN p.email IS NULL THEN NULL
      WHEN position('@' in p.email) < 3 THEN '•••' || substring(p.email from position('@' in p.email))
      ELSE left(p.email, 1) || '•••' || substring(p.email from position('@' in p.email) - 1)
    END::text AS email_masked,
    p.account_number::text,
    public.country_to_currency(coalesce(p.address_country, p.country_code))::text
  FROM public.profiles p
  WHERE p.user_id <> v_caller
    AND p.efin_tag IS NOT NULL
    AND (
      v_query = ''
      OR lower(p.efin_tag) LIKE v_query || '%'
      OR lower(p.full_name) LIKE '%' || v_query || '%'
      OR lower(split_part(coalesce(p.email, ''), '@', 1)) LIKE v_query || '%'
      OR (length(v_digits) BETWEEN 4 AND 10 AND p.account_number LIKE v_digits || '%')
    )
  ORDER BY
    (lower(p.efin_tag) = v_query) DESC,
    p.efin_tag ASC,
    p.user_id
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_efin_recipients(text, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_efin_recipients(text, int, int) TO authenticated;

-- 3) Replace search_efin_recipients: same coalesce cleanup, restrict to
--    tag-havers, and use the trigram/btree index for the prefix.
CREATE OR REPLACE FUNCTION public.search_efin_recipients(p_query text)
RETURNS TABLE(user_id uuid, full_name text, efin_tag text, avatar_url text, email_masked text, account_number text, base_currency text)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_query text;
  v_digits text;
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_query := lower(btrim(coalesce(p_query, '')));
  IF left(v_query, 1) = '@' THEN
    v_query := substring(v_query from 2);
  END IF;
  IF length(v_query) < 3 THEN
    RETURN;
  END IF;

  IF NOT public.check_rate_limit('efin_search:' || v_caller::text, 120, 60) THEN
    RAISE EXCEPTION 'Too many lookups, please slow down';
  END IF;

  v_digits := regexp_replace(v_query, '\D', '', 'g');

  RETURN QUERY
  SELECT
    p.user_id,
    p.full_name::text,
    p.efin_tag::text,
    p.avatar_url::text,
    CASE
      WHEN p.email IS NULL THEN NULL
      WHEN position('@' in p.email) < 3 THEN '•••' || substring(p.email from position('@' in p.email))
      ELSE left(p.email, 1) || '•••' || substring(p.email from position('@' in p.email) - 1)
    END::text AS email_masked,
    p.account_number::text,
    public.country_to_currency(coalesce(p.address_country, p.country_code))::text
  FROM public.profiles p
  WHERE p.user_id <> v_caller
    AND p.efin_tag IS NOT NULL
    AND (
      lower(p.efin_tag) LIKE v_query || '%'
      OR lower(split_part(coalesce(p.email, ''), '@', 1)) LIKE v_query || '%'
      OR (length(v_digits) = 10 AND p.account_number = v_digits)
    )
  ORDER BY
    (lower(p.efin_tag) = v_query) DESC,
    p.efin_tag ASC
  LIMIT 5;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_efin_recipients(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.search_efin_recipients(text) TO authenticated;
