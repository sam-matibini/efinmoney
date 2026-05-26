
CREATE TABLE public.short_links (
  code text PRIMARY KEY,
  owner_id uuid,
  target_path text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  max_uses integer,
  use_count integer NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_short_links_owner ON public.short_links(owner_id);

GRANT SELECT, INSERT, UPDATE ON public.short_links TO authenticated;
GRANT ALL ON public.short_links TO service_role;

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view own short links"
  ON public.short_links FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners insert own short links"
  ON public.short_links FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners revoke own short links"
  ON public.short_links FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Base62 code generator
CREATE OR REPLACE FUNCTION public._gen_short_code(p_len int DEFAULT 6)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_alphabet text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  v_code text := '';
  v_bytes bytea;
  i int;
BEGIN
  v_bytes := gen_random_bytes(p_len);
  FOR i IN 0..p_len-1 LOOP
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 62) + 1, 1);
  END LOOP;
  RETURN v_code;
END;
$$;

-- Create short link
CREATE OR REPLACE FUNCTION public.create_short_link(
  p_target_path text,
  p_params jsonb DEFAULT '{}'::jsonb,
  p_expires_at timestamptz DEFAULT NULL,
  p_max_uses int DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_len int := 6;
  v_attempts int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_target_path IS NULL OR p_target_path = '' OR left(p_target_path, 1) <> '/' THEN
    RAISE EXCEPTION 'target_path must be an absolute path starting with /';
  END IF;

  IF NOT public.check_rate_limit('shortlink:' || v_uid::text, 30, 60) THEN
    RAISE EXCEPTION 'Too many short links created, please slow down';
  END IF;

  LOOP
    v_code := public._gen_short_code(v_len);
    BEGIN
      INSERT INTO public.short_links(code, owner_id, target_path, params, expires_at, max_uses)
      VALUES (v_code, v_uid, p_target_path, COALESCE(p_params, '{}'::jsonb), p_expires_at, p_max_uses);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
      IF v_attempts >= 5 THEN v_len := 8; END IF;
      IF v_attempts >= 10 THEN
        RAISE EXCEPTION 'Could not generate unique short code';
      END IF;
    END;
  END LOOP;
END;
$$;

-- Resolve short link (public)
CREATE OR REPLACE FUNCTION public.resolve_short_link(p_code text)
RETURNS TABLE(target_path text, params jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.short_links%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.short_links WHERE code = p_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Link not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Link revoked' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RAISE EXCEPTION 'Link expired' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.max_uses IS NOT NULL AND v_row.use_count >= v_row.max_uses THEN
    RAISE EXCEPTION 'Link usage exhausted' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.short_links
     SET use_count = use_count + 1
   WHERE code = p_code;

  target_path := v_row.target_path;
  params := v_row.params;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_short_link(text, jsonb, timestamptz, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_short_link(text) TO anon, authenticated;
