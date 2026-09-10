-- Customer FX swaps post debit/credit legs to the user's own wallets.
-- Inserts were staff-only, so CAD→USDC from the app failed with:
--   new row violates row-level security policy for table "ledger_entries"
-- Staff can still insert any row (including wallet_id NULL). Customers may
-- only insert rows for wallets they own. FX-clearing auto-balance legs use
-- wallet_id NULL and must run as SECURITY DEFINER.

DROP POLICY IF EXISTS "Users insert own wallet ledger entries" ON public.ledger_entries;

CREATE POLICY "Users insert own wallet ledger entries"
ON public.ledger_entries
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND wallet_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.wallets w
    WHERE w.id = wallet_id
      AND w.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.enforce_journal_currency_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  WITH touched AS (
    SELECT DISTINCT journal_id FROM affected
  ),
  bad AS (
    SELECT le.journal_id, le.currency_code,
           ROUND((SUM(le.debit_amount) - SUM(le.credit_amount))::numeric, 2) AS diff
      FROM public.ledger_entries le
      JOIN touched t ON t.journal_id = le.journal_id
     WHERE le.currency_code IS NOT NULL
     GROUP BY le.journal_id, le.currency_code
    HAVING ABS(SUM(le.debit_amount) - SUM(le.credit_amount)) > 0.005
  )
  INSERT INTO public.ledger_entries
    (journal_id, account_id, wallet_id, currency_code,
     debit_amount, credit_amount, description, reference_type, external_reference)
  SELECT bad.journal_id,
         public.ensure_fx_clearing_account(bad.currency_code),
         NULL,
         bad.currency_code,
         CASE WHEN bad.diff < 0 THEN ABS(bad.diff) ELSE 0 END,
         CASE WHEN bad.diff > 0 THEN bad.diff ELSE 0 END,
         'FX Clearing — auto-balancing cross-currency leg',
         'fx_clearing_auto',
         NULL
    FROM bad;
  RETURN NULL;
END
$function$;
