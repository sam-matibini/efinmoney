-- Tier 2 #5: compute profiles.risk_score (0-100) automatically.
-- The column exists on profiles but was never written. The score is a simple
-- weighted sum that anyone can explain at audit:
--   base 0
--   + 20  if kyc_status='verified' AND kyc_tier='tier_2' (or kyc_tier aliases)
--   + 40  if kyc_status='verified' AND kyc_tier='tier_3' (full KYC)
--   - 10  if date_of_birth IS NULL
--   - 10  if occupation IS NULL
--   - 10  if nationality IS NULL
--   + 15  if address country is 'high' in geographic_risk_ratings
--   + 30  if address country is 'prohibited' in geographic_risk_ratings
--   - 5   per year of account age (capped at -20; rewards longevity)
-- The score is clamped to [0, 100]. Recomputed on every UPDATE of any
-- contributing field and at handle_new_user() signup time.
--
-- SECURITY DEFINER + search_path locked so it can be called from triggers
-- that may run with reduced privileges.

CREATE OR REPLACE FUNCTION public.compute_profile_risk_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base int := 0;
  v_country_risk text;
  v_score int;
  v_age_years numeric;
BEGIN
  -- Tier base
  IF NEW.kyc_status = 'verified' THEN
    v_base := v_base + 20;
    IF NEW.kyc_tier = 'tier_3' THEN
      v_base := v_base + 40;
    ELSIF NEW.kyc_tier = 'tier_2' THEN
      v_base := v_base + 20;
    END IF;
  END IF;

  -- Missing identity fields
  IF NEW.date_of_birth IS NULL THEN v_base := v_base - 10; END IF;
  IF NEW.occupation   IS NULL THEN v_base := v_base - 10; END IF;
  IF NEW.nationality  IS NULL THEN v_base := v_base - 10; END IF;

  -- Country risk (only if address country is set)
  IF NEW.address_country IS NOT NULL THEN
    SELECT risk_level INTO v_country_risk
    FROM public.geographic_risk_ratings
    WHERE country_code = upper(NEW.address_country);
    IF v_country_risk = 'high'        THEN v_base := v_base + 15;
    ELSIF v_country_risk = 'prohibited' THEN v_base := v_base + 30;
    END IF;
  END IF;

  -- Longevity reward: up to -20 over 4 years
  IF NEW.created_at IS NOT NULL THEN
    v_age_years := extract(epoch from (now() - NEW.created_at)) / 86400.0 / 365.25;
    v_base := v_base - least(20, greatest(0, floor(v_age_years * 5)::int));
  END IF;

  -- Clamp
  v_score := greatest(0, least(100, v_base));

  NEW.risk_score := v_score;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_compute_profile_risk_score ON public.profiles;
CREATE TRIGGER trg_compute_profile_risk_score
  BEFORE INSERT OR UPDATE OF
    kyc_status, kyc_tier, date_of_birth, occupation, nationality,
    address_country, created_at
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.compute_profile_risk_score();

-- Backfill existing rows so the column isn't permanently 0 for current users.
UPDATE public.profiles SET risk_score = risk_score;
