CREATE OR REPLACE FUNCTION public.list_efin_recipients(p_query text DEFAULT '', p_limit int DEFAULT 20, p_offset int DEFAULT 0)
RETURNS TABLE(user_id uuid, full_name text, efin_tag text, avatar_url text, email_masked text, account_number text, base_currency text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_query text;
  v_digits text;
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.check_rate_limit('efin_list:' || v_caller::text, 120, 60) THEN
    RAISE EXCEPTION 'Too many lookups, please slow down';
  END IF;

  v_query := lower(btrim(coalesce(p_query, '')));
  IF left(v_query, 1) = '@' THEN
    v_query := substring(v_query from 2);
  END IF;
  v_digits := regexp_replace(v_query, '\D', '', 'g');

  RETURN QUERY
  WITH recent AS (
    SELECT lower(ltrim(t.recipient_account, '@')) AS ident, max(t.created_at) AS last_at
    FROM public.transfers t
    WHERE t.sender_id = v_caller
      AND t.transfer_type = 'internal'
      AND t.recipient_account IS NOT NULL
    GROUP BY 1
  )
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
  LEFT JOIN recent r
    ON r.ident = lower(coalesce(p.email, ''))
    OR r.ident = lower(coalesce(p.efin_tag, ''))
  WHERE p.user_id <> v_caller
    AND (
      v_query = ''
      OR lower(coalesce(p.efin_tag, '')) LIKE v_query || '%'
      OR lower(coalesce(p.full_name, '')) LIKE '%' || v_query || '%'
      OR lower(split_part(coalesce(p.email, ''), '@', 1)) LIKE v_query || '%'
      OR (length(v_digits) BETWEEN 4 AND 10 AND coalesce(p.account_number, '') LIKE v_digits || '%')
    )
  ORDER BY
    r.last_at DESC NULLS LAST,
    (lower(coalesce(p.efin_tag, '')) = v_query) DESC,
    lower(coalesce(p.full_name, p.efin_tag, p.email, '')) ASC,
    p.user_id
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_efin_recipients(text, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.list_efin_recipients(text, int, int) TO authenticated;