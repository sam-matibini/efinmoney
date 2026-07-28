-- One-time "You're verified" bell notification when a user's KYC is approved.
--
-- Fires on the actual verification_status transition into 'approved', so no
-- matter how many times the client signals completion (overlapping Persona
-- status polls, retries, a second tab), the row only transitions once and the
-- user gets exactly one message. A NOT EXISTS guard makes a duplicate
-- structurally impossible even under a race. Runs AFTER UPDATE with SECURITY
-- DEFINER so it never blocks the decision and bypasses the row's RLS.
--
-- Mirrors the KYB "Business verified" pattern (after_kyb_decision).

CREATE OR REPLACE FUNCTION public.after_kyc_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only act on a real transition into 'approved'.
  IF NEW.verification_status = 'approved'
     AND OLD.verification_status IS DISTINCT FROM 'approved' THEN
    -- Dedup: at most one kyc_approved notification per user, ever.
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications
      WHERE user_id = NEW.user_id AND type = 'kyc_approved'
    ) THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        NEW.user_id,
        'You''re verified',
        'Your identity has been verified — your account is now fully active.',
        'kyc_approved'
      );
    END IF;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_after_kyc_approved ON public.kyc_verifications;
CREATE TRIGGER trg_after_kyc_approved
  AFTER UPDATE OF verification_status ON public.kyc_verifications
  FOR EACH ROW EXECUTE FUNCTION public.after_kyc_approved();
