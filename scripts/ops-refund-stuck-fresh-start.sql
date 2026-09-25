-- Clear EVERYTHING the dashboard counts as in-transit:
-- initiated | funded | processing | pending_liquidity | pending_ops
-- (+ failed leftovers). Refunds wallet when a transfer ledger debit exists.

-- 1) Preview what will be cleared
SELECT id, status, source_amount, source_currency, target_currency, recipient_name, payout_method, created_at
FROM public.transfers
WHERE status IN ('initiated', 'pending_ops', 'pending_liquidity', 'funded', 'processing', 'failed')
  AND created_at > now() - interval '90 days'
ORDER BY created_at DESC;

-- 2) Bulk refund / cancel
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
    WHERE t.status IN ('initiated', 'pending_ops', 'pending_liquidity', 'funded', 'processing', 'failed')
      AND t.created_at > now() - interval '90 days'
  LOOP
    SELECT count(*) INTO already
    FROM public.ledger_entries
    WHERE reference_type = 'transfer_reversal' AND reference_id = r.id;

    IF already > 0 THEN
      UPDATE public.transfers SET
        status = 'reversed',
        ops_status = 'refunded',
        ops_note = coalesce(ops_note, '') || ' | already reversed; marked reversed (fresh start)',
        ops_resolved_at = now(),
        failure_reason = left(coalesce(failure_reason, 'Refunded — start fresh'), 500),
        updated_at = now()
      WHERE id = r.id AND status <> 'reversed';
      n := n + 1;
      CONTINUE;
    END IF;

    -- Reverse wallet debit if present
    IF EXISTS (
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
        left('OPS REFUND (fresh start): ' || coalesce(description, ''), 500),
        'transfer_reversal', r.id
      FROM public.ledger_entries
      WHERE reference_type = 'transfer' AND reference_id = r.id;
    END IF;

    UPDATE public.transfers SET
      status = 'reversed',
      ops_status = 'refunded',
      ops_note = 'Bulk refund/cancel — clear in-transit (includes initiated)',
      ops_resolved_at = now(),
      failure_reason = 'Cancelled / refunded to wallet — starting fresh',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
    WHERE id = r.id;

    n := n + 1;
  END LOOP;

  RAISE NOTICE 'Cleared % in-transit/stuck transfers', n;
END $$;

-- 3) Confirm dashboard pending set is empty
SELECT status, count(*)
FROM public.transfers
WHERE status IN ('initiated', 'pending_ops', 'pending_liquidity', 'funded', 'processing')
  AND created_at > now() - interval '90 days'
GROUP BY status;
