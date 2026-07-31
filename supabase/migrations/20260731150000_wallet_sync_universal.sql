-- Universal wallet-default sync.
--
-- Previously the trigger only fired on address_country / country_code changes,
-- missing two cases:
--   • Admin or user explicitly changes default_currency
--   • Profile is updated but country columns were already set (no column change
--     detected by Postgres, so trigger never fired)
--
-- Fix:
--   1. Trigger now also fires on default_currency changes.
--   2. Priority: if default_currency changed explicitly, use that as the wallet
--      target. Otherwise derive from address_country / country_code as before.
--   3. After switching the wallet, keep profiles.default_currency in sync with
--      the chosen currency so the three signals stay coherent.
--   4. Trigger stays UPDATE-only — new-user wallet creation is handled by
--      handle_new_user, which already does this correctly.

CREATE OR REPLACE FUNCTION public.sync_default_wallet_to_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ccy text;
BEGIN
  -- Prefer an explicit default_currency change; otherwise derive from country.
  IF NEW.default_currency IS NOT NULL
     AND (OLD.default_currency IS DISTINCT FROM NEW.default_currency) THEN
    v_ccy := NEW.default_currency;
  ELSE
    v_ccy := public.country_to_currency(
               COALESCE(NEW.address_country, NEW.country_code));
  END IF;

  IF v_ccy IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- Ensure the target wallet exists (zero balance if brand-new).
    INSERT INTO public.wallets (user_id, currency_code, is_default)
    VALUES (NEW.user_id, v_ccy, false)
    ON CONFLICT (user_id, currency_code) DO NOTHING;

    -- Flip is_default: target wallet = true, all others = false.
    UPDATE public.wallets
       SET is_default = (currency_code = v_ccy)
     WHERE user_id = NEW.user_id;

    -- Keep profiles.default_currency coherent (only update if it differs,
    -- and only when the trigger was fired by a country change, not a
    -- default_currency change — avoids an infinite trigger loop).
    IF OLD.default_currency IS NOT DISTINCT FROM NEW.default_currency
       AND NEW.default_currency IS DISTINCT FROM v_ccy THEN
      UPDATE public.profiles
         SET default_currency = v_ccy
       WHERE user_id = NEW.user_id;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sync_default_wallet_to_country failed for user %: % (%)',
      NEW.user_id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

-- Recreate trigger to also cover default_currency column.
DROP TRIGGER IF EXISTS trg_sync_default_wallet_to_country ON public.profiles;
CREATE TRIGGER trg_sync_default_wallet_to_country
  AFTER UPDATE OF address_country, country_code, default_currency ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_default_wallet_to_country();
