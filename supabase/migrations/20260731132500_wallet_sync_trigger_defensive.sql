-- Make the wallet-sync trigger defensive: if the wallet write fails for
-- any reason, log a WARNING and let the parent profile update succeed.
-- Profile data is the source of truth; the wallet default can always be
-- re-synced out-of-band.

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

  BEGIN
    INSERT INTO public.wallets (user_id, currency_code, is_default)
    VALUES (NEW.user_id, v_ccy, false)
    ON CONFLICT (user_id, currency_code) DO NOTHING;

    UPDATE public.wallets
       SET is_default = (currency_code = v_ccy)
     WHERE user_id = NEW.user_id;
  EXCEPTION WHEN OTHERS THEN
    -- Never fail the parent transaction. The wallet default can be
    -- repaired by re-running the backfill or by a future write.
    RAISE WARNING 'sync_default_wallet_to_country failed for user %: % (%)',
      NEW.user_id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;
