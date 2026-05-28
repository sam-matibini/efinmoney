
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enums
DO $$ BEGIN
  CREATE TYPE public.aml_source AS ENUM ('ofac','un','eu','uk','ca','pep');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.aml_entity_type AS ENUM ('individual','entity','vessel','aircraft','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.aml_screening_trigger AS ENUM ('kyc','transfer','p2p','manual','rescreen');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.aml_screening_status AS ENUM ('clear','hit','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.aml_match_disposition AS ENUM ('pending','true_match','false_positive','escalated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.aml_profile_status AS ENUM ('unscreened','clear','hit','review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Watchlist
CREATE TABLE IF NOT EXISTS public.aml_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source public.aml_source NOT NULL,
  source_id TEXT NOT NULL,
  entity_type public.aml_entity_type NOT NULL DEFAULT 'individual',
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  dob DATE,
  dob_year INT,
  nationalities TEXT[] NOT NULL DEFAULT '{}',
  countries TEXT[] NOT NULL DEFAULT '{}',
  programs TEXT[] NOT NULL DEFAULT '{}',
  remarks TEXT,
  source_url TEXT,
  raw JSONB,
  list_published_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_aml_watchlist_name_trgm ON public.aml_watchlist USING gin (name_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_aml_watchlist_aliases ON public.aml_watchlist USING gin (aliases);
CREATE INDEX IF NOT EXISTS idx_aml_watchlist_source ON public.aml_watchlist (source);

GRANT SELECT ON public.aml_watchlist TO authenticated;
GRANT ALL ON public.aml_watchlist TO service_role;
ALTER TABLE public.aml_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read watchlist"
  ON public.aml_watchlist FOR SELECT TO authenticated
  USING (public.is_admin_user(auth.uid()) OR public.is_kyc_reviewer(auth.uid()));

-- Screenings
CREATE TABLE IF NOT EXISTS public.aml_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  trigger public.aml_screening_trigger NOT NULL,
  trigger_ref UUID,
  subject_name TEXT NOT NULL,
  subject_dob DATE,
  subject_country TEXT,
  status public.aml_screening_status NOT NULL DEFAULT 'clear',
  match_count INT NOT NULL DEFAULT 0,
  screened_by UUID,
  screened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aml_screenings_user ON public.aml_screenings (user_id, screened_at DESC);
CREATE INDEX IF NOT EXISTS idx_aml_screenings_status ON public.aml_screenings (status);

GRANT SELECT ON public.aml_screenings TO authenticated;
GRANT ALL ON public.aml_screenings TO service_role;
ALTER TABLE public.aml_screenings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own screenings"
  ON public.aml_screenings FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_user(auth.uid()) OR public.is_kyc_reviewer(auth.uid()));

-- Matches
CREATE TABLE IF NOT EXISTS public.aml_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id UUID NOT NULL REFERENCES public.aml_screenings(id) ON DELETE CASCADE,
  watchlist_id UUID NOT NULL REFERENCES public.aml_watchlist(id) ON DELETE CASCADE,
  score NUMERIC(5,4) NOT NULL,
  match_type TEXT NOT NULL,
  disposition public.aml_match_disposition NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aml_matches_screening ON public.aml_matches (screening_id);
CREATE INDEX IF NOT EXISTS idx_aml_matches_disposition ON public.aml_matches (disposition);

GRANT SELECT ON public.aml_matches TO authenticated;
GRANT ALL ON public.aml_matches TO service_role;
ALTER TABLE public.aml_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own matches"
  ON public.aml_matches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.aml_screenings s
      WHERE s.id = aml_matches.screening_id
        AND (s.user_id = auth.uid() OR public.is_admin_user(auth.uid()) OR public.is_kyc_reviewer(auth.uid()))
    )
  );

CREATE POLICY "Admins update match dispositions"
  ON public.aml_matches FOR UPDATE TO authenticated
  USING (public.is_admin_user(auth.uid()) OR public.is_kyc_reviewer(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()) OR public.is_kyc_reviewer(auth.uid()));

-- Profile flags
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aml_status public.aml_profile_status NOT NULL DEFAULT 'unscreened',
  ADD COLUMN IF NOT EXISTS aml_last_screened_at TIMESTAMPTZ;

-- Helper: normalize a name for fuzzy matching
CREATE OR REPLACE FUNCTION public.aml_normalize_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT lower(regexp_replace(coalesce(p_name,''), '[^a-zA-Z0-9 ]', ' ', 'g'))
$$;
