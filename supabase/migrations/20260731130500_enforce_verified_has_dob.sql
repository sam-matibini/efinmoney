-- Tier 2 #6: data quality invariant.
-- A profile marked kyc_status='verified' MUST have a date_of_birth on file.
-- Without this, a downstream agent or admin can approve KYC without the
-- required identity field, and Tier 1's risk score can't trust the
-- "verified" label to mean "we know who this is".
--
-- Backfills any existing offenders to kyc_status='pending' so a human can
-- review, instead of silently corrupting the verified-set.

CREATE OR REPLACE FUNCTION public.enforce_verified_has_dob()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kyc_status = 'verified' AND NEW.date_of_birth IS NULL THEN
    RAISE EXCEPTION
      'Cannot mark profile verified without date_of_birth (user_id=%, account=%)',
      NEW.user_id, NEW.account_number;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_verified_has_dob ON public.profiles;
CREATE TRIGGER trg_enforce_verified_has_dob
  BEFORE INSERT OR UPDATE OF kyc_status, date_of_birth ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_verified_has_dob();

-- One-time cleanup: any existing row that's "verified" but has no DOB gets
-- downgraded to "pending" so it can be re-verified properly. The admin
-- dashboard surfaces these via the standard KYC queue.
UPDATE public.profiles
   SET kyc_status = 'pending'
 WHERE kyc_status = 'verified'
   AND date_of_birth IS NULL;
