-- Canada bill pay: carry the biller reference on the payout, and keep
-- bill_payments in step with the linked transfer (bill_payments.flw_reference = transfers.id).

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS idx_bill_payments_flw_reference
  ON public.bill_payments(flw_reference);

CREATE OR REPLACE FUNCTION public.sync_bill_payment_from_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.transfer_type::text <> 'bill_payment' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_status := CASE NEW.status::text
    WHEN 'completed' THEN 'completed'
    WHEN 'failed' THEN 'failed'
    WHEN 'reversed' THEN 'refunded'
    WHEN 'expired' THEN 'failed'
    ELSE 'processing'
  END;

  UPDATE public.bill_payments
     SET status = v_status,
         failure_reason = CASE WHEN v_status IN ('failed', 'refunded')
                               THEN COALESCE(NEW.failure_reason, failure_reason)
                               ELSE failure_reason END
   WHERE flw_reference = NEW.id::text
     AND status IS DISTINCT FROM v_status
     AND status NOT IN ('completed', 'refunded');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bill_payment_from_transfer ON public.transfers;
CREATE TRIGGER trg_sync_bill_payment_from_transfer
  AFTER UPDATE OF status ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.sync_bill_payment_from_transfer();
