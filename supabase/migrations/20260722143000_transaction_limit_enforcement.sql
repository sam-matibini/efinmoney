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
-- CURRENCY: tier limits are plain numbers with no currency attached, while
-- transfers.source_amount can be NGN, GHS, CAD, USD... Comparing them directly
-- is meaningless -- NGN 1,000 is about CAD 0.90, so a naive comparison against
-- a limit of 500 would block essentially every NGN transfer. Everything is
-- therefore converted to a single base currency (see limit_base_currency)
-- before comparison.
--
-- STALENESS: refresh-fx-rates writes rows with valid_until = now + 2 hours and
-- nothing in this repo schedules it, so fx_rates is expired most of the time.
-- The limit path therefore accepts stale rates (fx_convert's p_allow_stale).
-- Scheduling that function is the real fix; this keeps the guardrail working
-- until it happens, instead of silently not enforcing anything.

-- ============== base currency ==============
-- Change via: ALTER DATABASE <db> SET app.settings.limit_base_currency = 'USD';
CREATE OR REPLACE FUNCTION public.limit_base_currency()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT upper(COALESCE(current_setting('app.settings.limit_base_currency', true), 'CAD'));
$$;

-- ============== FX conversion ==============
-- Latest rate, direct or inverted. Returns NULL when the pair is unknown --
-- callers must decide what that means rather than assume 1:1.
--
-- p_allow_stale: refresh-fx-rates stamps valid_until = now + 2 hours and is not
-- scheduled by anything in this repo, so in practice every row is expired most
-- of the time. Passing true falls back to the most recent rate regardless of
-- its validity window.
--
-- ONLY pass true for coarse guardrails such as limit checks, where a day-old
-- rate is far better than no check at all. NEVER pass true for pricing,
-- quoting, settlement or anything a customer is charged against -- those must
-- fail loudly on a stale rate rather than transact on one.
CREATE OR REPLACE FUNCTION public.fx_convert(
  p_amount      numeric,
  p_from        text,
  p_to          text,
  p_allow_stale boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rate numeric;
BEGIN
  IF p_amount IS NULL THEN RETURN NULL; END IF;
  IF upper(p_from) = upper(p_to) THEN RETURN p_amount; END IF;

  -- Direct pair.
  SELECT effective_rate INTO v_rate
    FROM public.fx_rates
   WHERE upper(from_currency) = upper(p_from)
     AND upper(to_currency)   = upper(p_to)
     AND (p_allow_stale OR valid_until IS NULL OR valid_until > now())
   ORDER BY valid_from DESC
   LIMIT 1;

  IF v_rate IS NOT NULL AND v_rate > 0 THEN
    RETURN p_amount * v_rate;
  END IF;

  -- Inverse pair.
  SELECT effective_rate INTO v_rate
    FROM public.fx_rates
   WHERE upper(from_currency) = upper(p_to)
     AND upper(to_currency)   = upper(p_from)
     AND (p_allow_stale OR valid_until IS NULL OR valid_until > now())
     AND effective_rate > 0
   ORDER BY valid_from DESC
   LIMIT 1;

  IF v_rate IS NOT NULL AND v_rate > 0 THEN
    RETURN p_amount / v_rate;
  END IF;

  RETURN NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fx_convert(numeric, text, text, boolean) TO authenticated;

-- ============== limit resolution ==============
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

-- ============== spend in window, normalised to base currency ==============
-- Counts only transfers that are still alive -- money that never left does not
-- consume a customer's allowance. Statuses per the transfer_status enum:
-- initiated, funded, processing, completed, failed, reversed, expired.
-- Rows with no known FX rate are skipped rather than counted at face value,
-- which would otherwise inflate spend by orders of magnitude.
-- Stale rates are accepted here: this is a guardrail, not a priced quote.
CREATE OR REPLACE FUNCTION public.transfer_spend_since(p_user_id uuid, p_since timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(sum(
           public.fx_convert(source_amount, source_currency,
                             public.limit_base_currency(), true)
         ), 0)
  FROM public.transfers
  WHERE sender_id = p_user_id
    AND created_at >= p_since
    AND status NOT IN ('failed'::transfer_status,
                       'reversed'::transfer_status,
                       'expired'::transfer_status);
$$;

GRANT EXECUTE ON FUNCTION public.transfer_spend_since(uuid, timestamptz) TO authenticated;

-- ============== the check ==============
CREATE OR REPLACE FUNCTION public.tg_transfers_check_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lim  RECORD;
  v_base text := public.limit_base_currency();
  v_amt  numeric;
  v_day  numeric;
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

  -- Stale rates accepted: a day-old rate is a far better guardrail than none.
  v_amt := public.fx_convert(NEW.source_amount, NEW.source_currency, v_base, true);

  -- Fail OPEN only when the pair is genuinely unknown. A missing FX pair must
  -- not halt payments in that corridor; the gap is logged instead. Blocking
  -- every transfer in an unpriced corridor would be a worse failure than
  -- briefly not enforcing a ceiling.
  IF v_amt IS NULL THEN
    RAISE WARNING 'tg_transfers_check_limit: no % -> % rate at all; limit not enforced for transfer by %',
      NEW.source_currency, v_base, NEW.sender_id;
    RETURN NEW;
  END IF;

  IF v_lim.single_limit > 0 AND v_amt > v_lim.single_limit THEN
    RAISE EXCEPTION
      'Transfer of % % (% %) exceeds your per-transaction limit of % % (% tier)',
      NEW.source_amount, NEW.source_currency, round(v_amt, 2), v_base,
      v_lim.single_limit, v_base, v_lim.tier_label
      USING ERRCODE = 'check_violation',
            HINT = 'limit_exceeded:single';
  END IF;

  IF v_lim.daily_limit > 0 THEN
    v_day := public.transfer_spend_since(NEW.sender_id, date_trunc('day', now()));
    IF v_day + v_amt > v_lim.daily_limit THEN
      RAISE EXCEPTION
        'This transfer would exceed your daily limit of % % (% % already sent today)',
        v_lim.daily_limit, v_base, round(v_day, 2), v_base
        USING ERRCODE = 'check_violation',
              HINT = 'limit_exceeded:daily';
    END IF;
  END IF;

  IF v_lim.monthly_limit > 0 THEN
    v_month := public.transfer_spend_since(NEW.sender_id, date_trunc('month', now()));
    IF v_month + v_amt > v_lim.monthly_limit THEN
      RAISE EXCEPTION
        'This transfer would exceed your monthly limit of % % (% % already sent this month)',
        v_lim.monthly_limit, v_base, round(v_month, 2), v_base
        USING ERRCODE = 'check_violation',
              HINT = 'limit_exceeded:monthly';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_transfers_check_limit ON public.transfers;
CREATE TRIGGER trg_transfers_check_limit
  BEFORE INSERT ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.tg_transfers_check_limit();

-- ============== read-only headroom for the UI ==============
CREATE OR REPLACE FUNCTION public.my_transaction_headroom()
RETURNS TABLE (
  scope text,
  tier_label text,
  base_currency text,
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
  SELECT l.scope, l.tier_label, public.limit_base_currency(), l.single_limit,
         l.daily_limit,   public.transfer_spend_since(auth.uid(), date_trunc('day', now())),
         l.monthly_limit, public.transfer_spend_since(auth.uid(), date_trunc('month', now()))
  FROM public.resolve_transaction_limits(auth.uid()) l;
$$;

GRANT EXECUTE ON FUNCTION public.my_transaction_headroom() TO authenticated;
