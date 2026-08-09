-- Force PostgREST to reload its schema cache.
-- Needed because the 20260720000000 migration added address + tel columns
-- without a NOTIFY, so PostgREST's cache still reports those columns as missing.
NOTIFY pgrst, 'reload schema';
