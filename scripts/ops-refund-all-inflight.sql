-- Clear ALL in-flight transfers, no date cutoff (dashboard still shows old ones).
DO $$
DECLARE
  r RECORD;
  j uuid;
  already int;
  n int := 0;
BEGIN
  FOR r IN
    SELECT t.id
    FROM public.transfers t
    WHERE t.status IN ('initiated', 'pending_ops', 'pending_liquidity', 'funded', 'processing')
  LOOP
    SELECT count(*) INTO already
    FROM public.ledger_entries
    WHERE reference_type = 'transfer_reversal' AND reference_id = r.id;

    IF already = 0 AND EXISTS (
      SELECT 1 FROM public.ledger_entries
      WHERE reference_type = 'transfer' AND reference_id = r.id
    ) THEN
      j := gen_random_uuid();
      INSERT INTO public.ledger_entries (
        journal_id, account_id, wallet_id, currency_code,
        debit_amount, credit_amount, description,
        reference_type, reference_id
      )
      SELECT
        j, account_id, wallet_id, currency_code,
        credit_amount, debit_amount,
        left('OPS REFUND (clear all pending): ' || coalesce(description, ''), 500),
        'transfer_reversal', r.id
      FROM public.ledger_entries
      WHERE reference_type = 'transfer' AND reference_id = r.id;
    END IF;

    UPDATE public.transfers SET
      status = 'reversed',
      ops_status = 'refunded',
      ops_note = 'Bulk clear ALL in-transit (no date cutoff)',
      ops_resolved_at = now(),
      failure_reason = 'Cancelled / refunded — clear dashboard pending',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
    WHERE id = r.id;

    n := n + 1;
  END LOOP;

  RAISE NOTICE 'Cleared % in-flight transfers (all ages)', n;
END $$;
