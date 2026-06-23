-- Daily automation for Safeguarding (RPAA Modules 5 + 22).
-- A SQL wrapper computes the three-way snapshot AND raises breach notifications,
-- scheduled via pg_cron. No secrets needed (runs server-side); the edge function
-- safeguarding-check remains for the on-demand "Run check now" button.

CREATE OR REPLACE FUNCTION public.run_safeguarding_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_today date := current_date;
BEGIN
  -- Compute + persist today's snapshot per currency.
  PERFORM public.compute_safeguarding_snapshot(v_today);

  -- Raise one notification per breached currency to each compliance role-holder,
  -- skipping any already sent today (idempotent across re-runs).
  INSERT INTO public.admin_notifications (admin_id, type, payload)
  SELECT ur.user_id,
         'safeguarding_breach',
         jsonb_build_object(
           'snapshot_date', s.snapshot_date,
           'currency_code', s.currency_code,
           'customer_wallet_liability', s.customer_wallet_liability,
           'ledger_trust_balance', s.ledger_trust_balance,
           'bank_trust_balance', s.bank_trust_balance,
           'surplus_deficit', s.surplus_deficit,
           'message', 'Safeguarding breach: ' || s.currency_code ||
                      ' trust balance is below customer funds by ' || abs(s.surplus_deficit) || '.'
         )
  FROM public.safeguarding_snapshots s
  CROSS JOIN (
    SELECT DISTINCT user_id
    FROM public.user_roles
    WHERE role IN ('admin', 'finance', 'compliance')
  ) ur
  WHERE s.snapshot_date = v_today
    AND s.status = 'breach'
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_notifications an
      WHERE an.admin_id = ur.user_id
        AND an.type = 'safeguarding_breach'
        AND an.created_at >= v_today::timestamptz
        AND an.payload->>'currency_code' = s.currency_code
    );
END;
$$;

REVOKE ALL ON FUNCTION public.run_safeguarding_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_safeguarding_check() TO service_role;

-- Schedule daily at 06:00 UTC. Idempotent: drop any prior job of the same name first.
DO $$
BEGIN
  PERFORM cron.unschedule('safeguarding-daily');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job didn't exist yet
END $$;

SELECT cron.schedule('safeguarding-daily', '0 6 * * *', $cron$ SELECT public.run_safeguarding_check(); $cron$);
