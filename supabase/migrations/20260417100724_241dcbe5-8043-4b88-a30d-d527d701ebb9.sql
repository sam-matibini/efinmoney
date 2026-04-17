
-- =========================================
-- #2: Lock down audit_logs inserts
-- =========================================
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
-- No INSERT policy = only service_role / SECURITY DEFINER functions can insert.

-- =========================================
-- #4: Balance + status check before transfer
-- =========================================
CREATE OR REPLACE FUNCTION public.check_transfer_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_status wallet_status;
  v_owner uuid;
BEGIN
  SELECT user_id, status INTO v_owner, v_status
  FROM public.wallets WHERE id = NEW.sender_wallet_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Source wallet not found';
  END IF;

  IF v_status IS DISTINCT FROM 'active'::wallet_status THEN
    RAISE EXCEPTION 'Wallet is not active (status: %)', v_status;
  END IF;

  SELECT COALESCE(SUM(credit_amount) - SUM(debit_amount), 0)
  INTO v_balance
  FROM public.ledger_entries
  WHERE wallet_id = NEW.sender_wallet_id;

  IF (NEW.source_amount + COALESCE(NEW.fee_amount, 0)) > v_balance THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_transfer_balance ON public.transfers;
CREATE TRIGGER trg_check_transfer_balance
  BEFORE INSERT ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.check_transfer_balance();

-- =========================================
-- #5: Notifications on transfer events
-- =========================================
CREATE OR REPLACE FUNCTION public.notify_transfer_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_message text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_title := 'Transfer Initiated';
    v_message := format('Your transfer of %s %s to %s has been initiated.',
      NEW.source_amount, NEW.source_currency, NEW.recipient_name);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text = 'completed' THEN
      v_title := 'Transfer Completed';
      v_message := format('Your transfer of %s %s to %s is completed.',
        NEW.source_amount, NEW.source_currency, NEW.recipient_name);
    ELSIF NEW.status::text = 'failed' THEN
      v_title := 'Transfer Failed';
      v_message := format('Your transfer of %s %s to %s has failed.',
        NEW.source_amount, NEW.source_currency, NEW.recipient_name);
    ELSIF NEW.status::text = 'cancelled' THEN
      v_title := 'Transfer Cancelled';
      v_message := format('Your transfer of %s %s to %s was cancelled.',
        NEW.source_amount, NEW.source_currency, NEW.recipient_name);
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (NEW.sender_id, v_title, v_message, 'transfer', false);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_transfer_event ON public.transfers;
CREATE TRIGGER trg_notify_transfer_event
  AFTER INSERT OR UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.notify_transfer_event();

-- Allow trigger to insert notifications regardless of caller
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

-- =========================================
-- #6: integration_settings table
-- =========================================
CREATE TABLE IF NOT EXISTS public.integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  is_enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view integration settings"
  ON public.integration_settings FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage integration settings"
  ON public.integration_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_integration_settings_updated_at
  BEFORE UPDATE ON public.integration_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
