-- Country-currency wallet as default, end-to-end.
--
-- 1. handle_new_user now reads the signup country from auth metadata and
--    creates the country-currency wallet as is_default=true, with USD + CAD
--    as additional non-default wallets for cross-currency transfers.
--    Unmapped country → falls back to CAD default (current behaviour).
--
-- 2. New trigger on profiles: when address_country is set or changed,
--    ensure the country-currency wallet exists and is the default. Handles
--    both the case where the user fills their address after signup and the
--    case where they edit their country later.
--
-- 3. Backfill existing users: for anyone with a mapped country, create the
--    wallet if missing and flip is_default to the country-currency wallet.
--    Existing USD/CAD balances are preserved — we only touch is_default.

-- 1) Updated handle_new_user ---------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country text;
  v_ccy     text;
  v_default text;
  v_usd_exists boolean;
  v_cad_exists boolean;
  v_local_exists boolean;
BEGIN
  v_country := upper(NEW.raw_user_meta_data->>'country');
  v_ccy     := public.country_to_currency(v_country);
  v_default := COALESCE(v_ccy, 'CAD');

  INSERT INTO public.profiles (user_id, email, account_status, kyc_framework_version, default_currency)
  VALUES (NEW.id, NEW.email, 'pending_verification', 2, v_default)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create the country-currency wallet as default, plus USD and CAD as
  -- additional wallets (cross-currency transfers need both). Skip duplicates
  -- so a re-fire on the same user (rare) doesn't error.
  IF v_default <> 'USD' AND v_default <> 'CAD' THEN
    INSERT INTO public.wallets (user_id, currency_code, is_default)
    VALUES (NEW.id, v_default, true)
    ON CONFLICT (user_id, currency_code) DO NOTHING;
  END IF;

  INSERT INTO public.wallets (user_id, currency_code, is_default)
  VALUES (NEW.id, 'USD', false)
  ON CONFLICT (user_id, currency_code) DO NOTHING;

  INSERT INTO public.wallets (user_id, currency_code, is_default)
  VALUES (NEW.id, 'CAD', false)
  ON CONFLICT (user_id, currency_code) DO NOTHING;

  -- If the country-currency IS USD or CAD, mark that one as the default
  -- (the inserts above all set is_default=false; flip the matching one).
  UPDATE public.wallets
     SET is_default = (currency_code = v_default)
   WHERE user_id = NEW.id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  INSERT INTO public.user_risk_tiers (
    user_id, current_tier,
    daily_transaction_limit, monthly_transaction_limit, single_transaction_limit,
    features_enabled
  )
  VALUES (
    NEW.id, 'tier_1', 500, 3000, 500,
    '{"receive":true,"send":true,"bills":true,"topup":true,"international":false,"virtual_card":false,"business":false}'::jsonb
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.kyc_verifications (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

  PERFORM public.invoke_send_email(
    'welcome',
    NEW.email,
    jsonb_build_object('name', COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  );

  RETURN NEW;
END;
$$;

-- 2) Trigger: keep wallet default in sync when address_country changes ----

CREATE OR REPLACE FUNCTION public.sync_default_wallet_to_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ccy text;
BEGIN
  v_ccy := public.country_to_currency(
    COALESCE(NEW.address_country, NEW.country_code)
  );
  IF v_ccy IS NULL THEN
    RETURN NEW;
  END IF;

  -- Ensure the country-currency wallet exists (zero balance if new)
  INSERT INTO public.wallets (user_id, currency_code, is_default)
  VALUES (NEW.user_id, v_ccy, false)
  ON CONFLICT (user_id, currency_code) DO NOTHING;

  -- Mark the country-currency wallet as default; demote all others
  UPDATE public.wallets
     SET is_default = (currency_code = v_ccy)
   WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_default_wallet_to_country ON public.profiles;
CREATE TRIGGER trg_sync_default_wallet_to_country
  AFTER INSERT OR UPDATE OF address_country, country_code ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_default_wallet_to_country();

-- 3) Backfill existing users ---------------------------------------------

-- For every user with a mapped country, ensure the wallet exists and is
-- the default. Handles the case in the screenshot (Nigerian user whose
-- wallets were created before the country-aware trigger existed).
INSERT INTO public.wallets (user_id, currency_code, is_default)
SELECT p.user_id,
       public.country_to_currency(COALESCE(p.address_country, p.country_code)),
       false
  FROM public.profiles p
 WHERE public.country_to_currency(COALESCE(p.address_country, p.country_code)) IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.currencies c
      WHERE c.code = public.country_to_currency(COALESCE(p.address_country, p.country_code))
   )
ON CONFLICT (user_id, currency_code) DO NOTHING;

UPDATE public.wallets w
   SET is_default = true
 WHERE w.user_id IN (
   SELECT p.user_id
     FROM public.profiles p
    WHERE public.country_to_currency(COALESCE(p.address_country, p.country_code)) = w.currency_code
 );

UPDATE public.wallets
   SET is_default = false
 WHERE user_id IN (
   SELECT user_id
     FROM public.wallets
    GROUP BY user_id
   HAVING bool_or(is_default)
 )
 AND currency_code NOT IN (
   SELECT public.country_to_currency(COALESCE(p.address_country, p.country_code))
     FROM public.profiles p
    WHERE p.user_id = public.wallets.user_id
 );
