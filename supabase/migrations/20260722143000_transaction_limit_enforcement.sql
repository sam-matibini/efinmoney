-- Transaction limit enforcement.
--
-- Until now tier limits were display-only: RiskTiersPanel and TierProgressCard
-- showed them, but nothing checked them before a transfer. Both individual
-- (user_risk_tiers) and business (business_tier_limits) limits were cosmetic.
--
-- Enforced here as a BEFORE INSERT trigger on transfers, next to the existing
-- check_transfer_balance, rather than in the 20+ edge functions that touch the
-- table -- one chokepoint means none can be missed.
--
-- Resolution: if the sender owns an APPROVED business, business limits apply;
-- otherwise their individual risk tier does.

CREATE OR REPLACE FUNCTION public.resolve_transaction_limits(p_user_id uuid)
RETURNS TABLE (
  scope text,
  tier_label text,
  daily_limit numeric,
  monthly_limit numeric,
  single_limit numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_biz RECORD;
BEGIN
  SELECT b.kyb_tier, l.label, l.daily_limit, l.monthly_limit, l.single_limit
    INTO v_biz
    FROM public.business_profiles b
    JOIN public.business_tier_limits l ON l.tier = b.kyb_tier
   WHERE b.owner_user_id = p_user_id
     AND b.kyb_status = 'approved'
   LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT 'business'::text, v_biz.label, v_biz.daily_limit,
                        v_biz.monthly_limit, v_biz.single_limit;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT 'individual'::text,
           t.current_tier::text,
           t.daily_transaction_limit,
           t.monthly_transaction_limit,
           t.single_transaction_limit
      FROM public.user_risk_tiers t
     WHERE t.user_id = p_user_id
     LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_transaction_limits(uuid) TO authenticated;

-- Spend already committed in the window. Counts only transfers that are still
-- alive -- money that never left does not consume a customer's allowance.
-- Statuses per the transfer_status enum: initiated, funded, processing,
-- completed, failed, reversed, expired.
CREATE OR REPLACE FUNCTION public.transfer_spend_since(p_user_id uuid, p_since timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(sum(source_amount), 0)
  FROM public.transfers
  WHERE sender_id = p_user_id
    AND created_at >= p_since
    AND status NOT IN ('failed'::transfer_status,
                       'reversed'::transfer_status,
                       'expired'::transfer_status);
$$;

GRANT EXECUTE ON FUNCTION public.transfer_spend_since(uuid, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_transfers_check_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lim RECORD;
  v_day numeric;
  v_month numeric;
BEGIN
  IF NEW.sender_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_lim FROM public.resolve_transaction_limits(NEW.sender_id);

  -- No tier on record: leave the transfer alone rather than block a user whose
  -- provisioning is incomplete. check_transfer_balance still guards the money.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_lim.single_limit > 0 AND NEW.source_amount > v_lim.single_limit THEN
    RAISE EXCEPTION
      'Transfer of % exceeds your per-transaction limit of % (% tier)',
      NEW.source_amount, v_lim.single_limit, v_lim.tier_label
      USING ERRCODE = 'check_violation',
            HINT = 'limit_exceeded:single';
  END IF;

  IF v_lim.daily_limit > 0 THEN
    v_day := public.transfer_spend_since(NEW.sender_id, date_trunc('day', now()));
    IF v_day + NEW.source_amount > v_lim.daily_limit THEN
      RAISE EXCEPTION
        'Transfer of % would exceed your daily limit of % (% already sent today)',
        NEW.source_amount, v_lim.daily_limit, v_day
        USING ERRCODE = 'check_violation',
              HINT = 'limit_exceeded:daily';
    END IF;
  END IF;

  IF v_lim.monthly_limit > 0 THEN
    v_month := public.transfer_spend_since(NEW.sender_id, date_trunc('month', now()));
    IF v_month + NEW.source_amount > v_lim.monthly_limit THEN
      RAISE EXCEPTION
        'Transfer of % would exceed your monthly limit of % (% already sent this month)',
        NEW.source_amount, v_lim.monthly_limit, v_month
        USING ERRCODE = 'check_violation',
              HINT = 'limit_exceeded:monthly';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Runs after trg_check_transfer_balance (alphabetical order on matching timing),
-- so a customer sees "insufficient balance" before "over your limit".
DROP TRIGGER IF EXISTS trg_transfers_check_limit ON public.transfers;
CREATE TRIGGER trg_transfers_check_limit
  BEFORE INSERT ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.tg_transfers_check_limit();

-- Read-only headroom for the UI.
CREATE OR REPLACE FUNCTION public.my_transaction_headroom()
RETURNS TABLE (
  scope text,
  tier_label text,
  single_limit numeric,
  daily_limit numeric,
  daily_used numeric,
  monthly_limit numeric,
  monthly_used numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.scope, l.tier_label, l.single_limit,
         l.daily_limit,   public.transfer_spend_since(auth.uid(), date_trunc('day', now())),
         l.monthly_limit, public.transfer_spend_since(auth.uid(), date_trunc('month', now()))
  FROM public.resolve_transaction_limits(auth.uid()) l;
$$;

GRANT EXECUTE ON FUNCTION public.my_transaction_headroom() TO authenticated;
