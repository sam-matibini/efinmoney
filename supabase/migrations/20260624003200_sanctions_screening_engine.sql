-- Sanctions Screening Engine (#12)
-- Edge function-driven screening against UN, Canada, OFAC, UK, EU lists.
-- Extends existing aml_screenings, aml_watchlist, aml_matches tables.

CREATE TABLE IF NOT EXISTS public.sanctions_screening_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('ofac', 'un', 'eu', 'uk', 'ca', 'pep')),
  name_threshold numeric(4,2) NOT NULL DEFAULT 0.85,
  alias_threshold numeric(4,2) NOT NULL DEFAULT 0.75,
  auto_flag boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.sanctions_screening_rules (source, name_threshold, alias_threshold, auto_flag, enabled)
VALUES
  ('ofac', 0.85, 0.75, true, true),
  ('un', 0.80, 0.70, true, true),
  ('ca', 0.85, 0.75, true, true),
  ('uk', 0.85, 0.75, false, true),
  ('eu', 0.85, 0.75, false, true),
  ('pep', 0.80, 0.70, true, true)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_sanctions_screening_rules_source ON public.sanctions_screening_rules(source);

ALTER TABLE public.sanctions_screening_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sanctions rules readable by admin roles" ON public.sanctions_screening_rules;
CREATE POLICY "Sanctions rules readable by admin roles"
  ON public.sanctions_screening_rules FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
  );

DROP POLICY IF EXISTS "Sanctions rules manageable by admin compliance" ON public.sanctions_screening_rules;
CREATE POLICY "Sanctions rules manageable by admin compliance"
  ON public.sanctions_screening_rules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Function: run sanctions screening for a given subject using pg_trgm similarity
CREATE OR REPLACE FUNCTION public.run_sanctions_screening(
  p_user_id uuid,
  p_subject_name text,
  p_subject_dob date DEFAULT NULL,
  p_subject_country text DEFAULT NULL,
  p_trigger aml_screening_trigger DEFAULT 'manual'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_screening_id uuid;
  v_match_count integer;
  v_watchlist record;
  v_score numeric;
  v_max_score numeric;
BEGIN
  -- Create screening record
  INSERT INTO public.aml_screenings (
    user_id, trigger, trigger_ref, subject_name, subject_dob, subject_country, status, screened_by
  ) VALUES (
    p_user_id, p_trigger, NULL, p_subject_name, p_subject_dob, p_subject_country, 'clear', auth.uid()
  ) RETURNING id INTO v_screening_id;

  v_match_count := 0;

  -- Fuzzy match against watchlist using pg_trgm similarity
  FOR v_watchlist IN
    SELECT wl.*,
           GREATEST(
             similarity(lower(wl.name_normalized), lower(p_subject_name)),
             similarity(lower(wl.name_normalized), lower(reverse(p_subject_name)))
           ) AS name_score
    FROM public.aml_watchlist wl
    JOIN public.sanctions_screening_rules r ON r.source = wl.source::text AND r.enabled = true
    WHERE lower(wl.name_normalized) % lower(p_subject_name)
    ORDER BY name_score DESC
    LIMIT 20
  LOOP
    v_max_score := v_watchlist.name_score;

    -- Check aliases too
    IF array_length(v_watchlist.aliases, 1) > 0 THEN
      FOR i IN 1..array_length(v_watchlist.aliases, 1) LOOP
        v_score := similarity(lower(v_watchlist.aliases[i]), lower(p_subject_name));
        IF v_score > v_max_score THEN v_max_score := v_score; END IF;
      END LOOP;
    END IF;

    IF v_max_score > COALESCE(
      (SELECT name_threshold FROM public.sanctions_screening_rules WHERE source = v_watchlist.source::text LIMIT 1),
      0.80
    ) THEN
      INSERT INTO public.aml_matches (screening_id, watchlist_id, score, match_type, disposition)
      VALUES (v_screening_id, v_watchlist.id, ROUND(v_max_score::numeric, 4), 'name', 'pending');
      v_match_count := v_match_count + 1;
    END IF;
  END LOOP;

  -- Update screening with match count
  UPDATE public.aml_screenings
  SET status = CASE WHEN v_match_count > 0 THEN 'hit' ELSE 'clear' END,
      match_count = v_match_count
  WHERE id = v_screening_id;

  RETURN v_screening_id;
END;
$$;

REVOKE ALL ON FUNCTION public.run_sanctions_screening(uuid, text, date, text, aml_screening_trigger) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_sanctions_screening(uuid, text, date, text, aml_screening_trigger) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_sanctions_screening(uuid, text, date, text, aml_screening_trigger) TO service_role;