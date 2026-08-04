DROP FUNCTION IF EXISTS public.lookup_efin_recipient(text);
CREATE OR REPLACE FUNCTION public.lookup_efin_recipient(p_query text)
 RETURNS TABLE(user_id uuid, full_name text, efin_tag text, avatar_url text, email text, account_number text, base_currency text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_query text;
  v_digits text;
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

  v_rl_key := 'efin_lookup:' || v_caller::text;
  IF NOT public.check_rate_limit(v_rl_key, 30, 60) THEN
    RAISE EXCEPTION 'Too many lookups, please slow down';
  END IF;

  IF left(v_query, 1) = '@' THEN
    v_query := substring(v_query from 2);
  END IF;

  v_digits := regexp_replace(v_query, '\D', '', 'g');

  RETURN QUERY
    SELECT p.user_id,
           p.full_name::text,
           p.efin_tag::text,
           p.avatar_url::text,
           p.email::text,
           p.account_number::text,
           coalesce(public.country_to_currency(coalesce(p.address_country, p.country_code)), p.default_currency)::text
      FROM public.profiles p
     WHERE p.user_id <> v_caller
       AND (
         lower(p.email) = v_query
         OR lower(p.efin_tag) = v_query
         OR (length(v_digits) >= 6 AND p.account_number = v_digits)
       )
     LIMIT 1;
END;
$function$;