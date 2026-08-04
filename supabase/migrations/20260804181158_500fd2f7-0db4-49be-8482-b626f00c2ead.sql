DROP FUNCTION IF EXISTS public.recent_efin_recipients();
CREATE OR REPLACE FUNCTION public.recent_efin_recipients()
 RETURNS TABLE(user_id uuid, full_name text, efin_tag text, avatar_url text, email text, account_number text, last_sent_at timestamp with time zone, base_currency text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  WITH recent AS (
    SELECT t.recipient_account AS ident, max(t.created_at) AS last_at
    FROM public.transfers t
    WHERE t.sender_id = v_caller
      AND t.transfer_type = 'internal'
      AND t.recipient_account IS NOT NULL
    GROUP BY t.recipient_account
  )
  SELECT
    p.user_id,
    p.full_name::text,
    p.efin_tag::text,
    p.avatar_url::text,
    p.email::text,
    p.account_number::text,
    r.last_at,
    coalesce(public.country_to_currency(coalesce(p.address_country, p.country_code)), p.default_currency)::text
  FROM recent r
  JOIN public.profiles p
    ON lower(coalesce(p.email, '')) = lower(ltrim(r.ident, '@'))
    OR lower(coalesce(p.efin_tag, '')) = lower(ltrim(r.ident, '@'))
  WHERE p.user_id <> v_caller
  ORDER BY r.last_at DESC
  LIMIT 8;
END;
$function$;

DROP FUNCTION IF EXISTS public.search_efin_recipients(text);
CREATE OR REPLACE FUNCTION public.search_efin_recipients(p_query text)
 RETURNS TABLE(user_id uuid, full_name text, efin_tag text, avatar_url text, email_masked text, account_number text, base_currency text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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

  IF NOT public.check_rate_limit('efin_search:' || v_caller::text, 60, 60) THEN
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
    coalesce(public.country_to_currency(coalesce(p.address_country, p.country_code)), p.default_currency)::text
  FROM public.profiles p
  WHERE p.user_id <> v_caller
    AND (
      lower(coalesce(p.efin_tag, '')) LIKE v_query || '%'
      OR lower(split_part(coalesce(p.email, ''), '@', 1)) LIKE v_query || '%'
      OR (length(v_digits) = 10 AND p.account_number = v_digits)
    )
  ORDER BY
    (lower(coalesce(p.efin_tag, '')) = v_query) DESC,
    p.efin_tag NULLS LAST
  LIMIT 5;
END;
$function$;