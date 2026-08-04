-- The sanctions-sync edge function (supabase/functions/sanctions-sync/index.ts)
-- reads/writes geographic_risk_ratings.canada_sanctions after every GAC (SEMA)
-- import, but no prior migration ever added that column. Supabase silently
-- returns an error on the SELECT (the function ignores the `error` field and
-- only destructures `data`), so `data` is null, the update loop never runs,
-- and every country's flag stays at its column default — which only exists
-- (implicitly, via un_sanctions/ofac_sanctions seeded true) for Iran.
ALTER TABLE public.geographic_risk_ratings
  ADD COLUMN IF NOT EXISTS canada_sanctions boolean NOT NULL DEFAULT false;
