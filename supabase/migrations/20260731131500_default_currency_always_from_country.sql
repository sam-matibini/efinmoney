-- Strengthen the default_currency trigger: country is the single source of
-- truth, recomputed on every UPDATE (not just country changes) and on
-- INSERT. Replaces the narrower trigger in 20260730120000 with one that
-- wins over any prior manual override.
--
-- Backfills every row that has a mapped country so the existing data
-- converges in the same migration.

CREATE OR REPLACE FUNCTION public.sync_default_currency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_ccy text;
BEGIN
  v_ccy := public.country_to_currency(
    COALESCE(NEW.address_country, NEW.country_code)
  );

  -- Unmapped country, or currency not seeded: leave the existing value alone
  -- so we don't accidentally clobber a value a human set intentionally.
  IF v_ccy IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v_ccy) THEN
    RETURN NEW;
  END IF;

  NEW.default_currency := v_ccy;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_default_currency ON public.profiles;
CREATE TRIGGER trg_profiles_default_currency
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_default_currency();

-- One-shot backfill: any row whose country maps to a known currency gets
-- reconciled, even if the trigger above never fired (e.g. country was set
-- before this migration was applied, or the previous narrower trigger
-- was bypassed by an UPDATE that didn't touch address_country).
UPDATE public.profiles p
   SET default_currency = public.country_to_currency(
         COALESCE(p.address_country, p.country_code)
       )
 WHERE public.country_to_currency(COALESCE(p.address_country, p.country_code)) IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.currencies
      WHERE code = public.country_to_currency(COALESCE(p.address_country, p.country_code))
   )
   AND p.default_currency IS DISTINCT FROM
       public.country_to_currency(COALESCE(p.address_country, p.country_code));
