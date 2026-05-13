
ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS funding_source text NOT NULL DEFAULT 'wallet'
  CHECK (funding_source IN ('wallet','card','bank'));

CREATE OR REPLACE FUNCTION public.check_transfer_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_status wallet_status;
  v_owner uuid;
BEGIN
  -- Skip balance check for non-wallet funded transfers (card/bank)
  IF NEW.funding_source IS DISTINCT FROM 'wallet' THEN
    RETURN NEW;
  END IF;

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
$function$;
