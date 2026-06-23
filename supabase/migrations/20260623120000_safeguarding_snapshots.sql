-- Safeguarding of End-User Funds (RPAA Modules 5 + 22)
-- Daily three-way validation: Customer Wallet Liability vs Ledger Trust vs Bank Trust.
-- Control: Trust >= Customer Funds. A deficit is a safeguarding breach.

CREATE TABLE IF NOT EXISTS public.safeguarding_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  currency_code varchar(10) NOT NULL REFERENCES public.currencies(code),
  -- What we owe end-users (sum of wallet-linked ledger entries, credits - debits)
  customer_wallet_liability numeric(20, 8) NOT NULL DEFAULT 0,
  -- Our books' record of trust assets (Bank Trust asset accounts, debits - credits)
  ledger_trust_balance numeric(20, 8) NOT NULL DEFAULT 0,
  -- Actual external bank trust balance (latest imported statement); null when no feed
  bank_trust_balance numeric(20, 8),
  -- (effective trust) - liability; negative = breach
  surplus_deficit numeric(20, 8) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'variance', 'breach')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_date, currency_code)
);

CREATE INDEX IF NOT EXISTS idx_safeguarding_snapshots_date
  ON public.safeguarding_snapshots (snapshot_date DESC);

ALTER TABLE public.safeguarding_snapshots ENABLE ROW LEVEL SECURITY;

-- Read-only to compliance roles; writes happen only via the service-role edge function.
DROP POLICY IF EXISTS "Safeguarding readable by compliance roles" ON public.safeguarding_snapshots;
CREATE POLICY "Safeguarding readable by compliance roles"
  ON public.safeguarding_snapshots FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'compliance'::app_role)
  );

-- Computes today's (or p_date's) three-way snapshot per currency and upserts it.
-- Returns the upserted rows. SECURITY DEFINER so the service role can run it; reads
-- are still gated by RLS above for direct client access.
CREATE OR REPLACE FUNCTION public.compute_safeguarding_snapshot(p_date date DEFAULT CURRENT_DATE)
RETURNS SETOF public.safeguarding_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH liability AS (
    SELECT le.currency_code AS ccy,
           COALESCE(SUM(le.credit_amount - le.debit_amount), 0) AS amt
    FROM public.ledger_entries le
    WHERE le.wallet_id IS NOT NULL
    GROUP BY le.currency_code
  ),
  ledger_trust AS (
    SELECT la.currency_code AS ccy,
           COALESCE(SUM(le.debit_amount - le.credit_amount), 0) AS amt
    FROM public.ledger_entries le
    JOIN public.ledger_accounts la ON la.id = le.account_id
    WHERE la.account_type = 'asset'
      AND la.name ILIKE 'Bank Trust%'
      AND la.currency_code IS NOT NULL
    GROUP BY la.currency_code
  ),
  trust_accts AS (
    SELECT id, currency_code
    FROM public.bank_accounts
    WHERE account_type = 'trust' AND is_active = true
  ),
  latest_bal AS (
    SELECT DISTINCT ON (bt.bank_account_id)
           ta.currency_code AS ccy, bt.balance
    FROM public.bank_transactions bt
    JOIN trust_accts ta ON ta.id = bt.bank_account_id
    WHERE bt.balance IS NOT NULL
    ORDER BY bt.bank_account_id, bt.transaction_date DESC, bt.imported_at DESC
  ),
  bank_trust AS (
    SELECT ccy, SUM(balance) AS amt
    FROM latest_bal
    GROUP BY ccy
  ),
  ccys AS (
    SELECT ccy FROM liability
    UNION SELECT ccy FROM ledger_trust
    UNION SELECT ccy FROM bank_trust
  ),
  computed AS (
    SELECT
      c.ccy AS currency_code,
      COALESCE(l.amt, 0) AS customer_wallet_liability,
      COALESCE(lt.amt, 0) AS ledger_trust_balance,
      bt.amt AS bank_trust_balance,
      COALESCE(bt.amt, COALESCE(lt.amt, 0)) - COALESCE(l.amt, 0) AS surplus_deficit
    FROM ccys c
    LEFT JOIN liability l ON l.ccy = c.ccy
    LEFT JOIN ledger_trust lt ON lt.ccy = c.ccy
    LEFT JOIN bank_trust bt ON bt.ccy = c.ccy
  ),
  upserted AS (
    INSERT INTO public.safeguarding_snapshots AS s (
      snapshot_date, currency_code, customer_wallet_liability,
      ledger_trust_balance, bank_trust_balance, surplus_deficit, status
    )
    SELECT
      p_date,
      currency_code,
      customer_wallet_liability,
      ledger_trust_balance,
      bank_trust_balance,
      surplus_deficit,
      CASE
        WHEN surplus_deficit < -0.01 THEN 'breach'
        WHEN bank_trust_balance IS NOT NULL
             AND abs(bank_trust_balance - ledger_trust_balance) > 0.01 THEN 'variance'
        ELSE 'ok'
      END
    FROM computed
    ON CONFLICT (snapshot_date, currency_code) DO UPDATE SET
      customer_wallet_liability = EXCLUDED.customer_wallet_liability,
      ledger_trust_balance = EXCLUDED.ledger_trust_balance,
      bank_trust_balance = EXCLUDED.bank_trust_balance,
      surplus_deficit = EXCLUDED.surplus_deficit,
      status = EXCLUDED.status,
      updated_at = now()
    RETURNING s.*
  )
  SELECT * FROM upserted;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_safeguarding_snapshot(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_safeguarding_snapshot(date) TO service_role;
