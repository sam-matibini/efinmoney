CREATE OR REPLACE FUNCTION public.next_interac_public_id()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'EFM-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.interac_intent_seq')::text, 8, '0');
$$;

GRANT EXECUTE ON FUNCTION public.next_interac_public_id() TO authenticated, service_role;