ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS occupation text;

CREATE OR REPLACE FUNCTION public.lock_verified_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- System / service-role updates have no auth context: allow.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Staff may always correct user data.
  IF public.has_role(auth.uid(), 'admin'::app_role) OR public.is_admin_user(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Only the user editing their own verified profile is restricted.
  IF auth.uid() = NEW.user_id AND OLD.kyc_status = 'verified'::kyc_status THEN
    IF NEW.full_name     IS DISTINCT FROM OLD.full_name
       OR NEW.date_of_birth  IS DISTINCT FROM OLD.date_of_birth
       OR NEW.phone_number   IS DISTINCT FROM OLD.phone_number
       OR NEW.street_address IS DISTINCT FROM OLD.street_address
       OR NEW.city           IS DISTINCT FROM OLD.city
       OR NEW.state_province IS DISTINCT FROM OLD.state_province
       OR NEW.postal_code    IS DISTINCT FROM OLD.postal_code
       OR NEW.address_country IS DISTINCT FROM OLD.address_country THEN
      RAISE EXCEPTION 'Verified identity details can only be changed by support';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_verified_profile_fields ON public.profiles;
CREATE TRIGGER trg_lock_verified_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.lock_verified_profile_fields();