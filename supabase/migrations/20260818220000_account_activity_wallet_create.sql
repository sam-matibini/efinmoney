-- Activity logging must never block wallet creation.
-- Client inserts were 403 after insert was revoked from authenticated.

GRANT SELECT, INSERT ON public.account_activity TO authenticated;
GRANT ALL ON public.account_activity TO service_role;
GRANT EXECUTE ON FUNCTION public.log_account_activity(uuid, text, text, jsonb) TO authenticated;

DROP POLICY IF EXISTS "Users can log their own activity" ON public.account_activity;
CREATE POLICY "Users can log their own activity"
  ON public.account_activity FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tg_wallets_account_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.log_account_activity(NEW.user_id, 'wallet_created',
        format('%s wallet created', NEW.currency_code), jsonb_build_object('currency', NEW.currency_code));
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.log_account_activity(NEW.user_id, 'wallet_status_changed',
        format('%s wallet %s', NEW.currency_code, NEW.status),
        jsonb_build_object('currency', NEW.currency_code, 'from', OLD.status, 'to', NEW.status));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'account_activity wallet log failed: %', SQLERRM;
  END;
  RETURN NEW;
END $$;
