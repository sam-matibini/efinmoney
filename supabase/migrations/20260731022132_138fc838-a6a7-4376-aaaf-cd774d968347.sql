-- 1) Country → currency helper (mirrors src/lib/currency.ts)
CREATE OR REPLACE FUNCTION public.country_to_currency(p_country text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE upper(left(coalesce(p_country, ''), 2))
    WHEN 'US' THEN 'USD' WHEN 'CA' THEN 'CAD' WHEN 'GB' THEN 'GBP'
    WHEN 'AU' THEN 'AUD' WHEN 'NZ' THEN 'NZD' WHEN 'CH' THEN 'CHF'
    WHEN 'IE' THEN 'EUR' WHEN 'FR' THEN 'EUR' WHEN 'DE' THEN 'EUR'
    WHEN 'ES' THEN 'EUR' WHEN 'IT' THEN 'EUR' WHEN 'NL' THEN 'EUR'
    WHEN 'BE' THEN 'EUR' WHEN 'PT' THEN 'EUR' WHEN 'AT' THEN 'EUR'
    WHEN 'FI' THEN 'EUR' WHEN 'GR' THEN 'EUR' WHEN 'LU' THEN 'EUR'
    WHEN 'NG' THEN 'NGN' WHEN 'KE' THEN 'KES' WHEN 'UG' THEN 'UGX'
    WHEN 'TZ' THEN 'TZS' WHEN 'RW' THEN 'RWF' WHEN 'ZM' THEN 'ZMW'
    WHEN 'GH' THEN 'GHS' WHEN 'ZA' THEN 'ZAR' WHEN 'BW' THEN 'BWP'
    WHEN 'NA' THEN 'NAD' WHEN 'MW' THEN 'MWK' WHEN 'MZ' THEN 'MZN'
    WHEN 'CM' THEN 'XAF' WHEN 'CI' THEN 'XOF' WHEN 'SN' THEN 'XOF'
    WHEN 'EG' THEN 'EGP' WHEN 'MA' THEN 'MAD' WHEN 'IN' THEN 'INR'
    WHEN 'BR' THEN 'BRL' WHEN 'MX' THEN 'MXN' WHEN 'AE' THEN 'AED'
    WHEN 'SA' THEN 'SAR' WHEN 'TR' THEN 'TRY' WHEN 'JP' THEN 'JPY'
    WHEN 'CN' THEN 'CNY' WHEN 'HK' THEN 'HKD' WHEN 'SG' THEN 'SGD'
    ELSE NULL
  END;
$$;

-- 2) Platform default currency is CAD
ALTER TABLE public.profiles ALTER COLUMN default_currency SET DEFAULT 'CAD';

-- 3) Backfill base currency from the domicile country (CAD when unknown)
UPDATE public.profiles p
SET default_currency = COALESCE(
      public.country_to_currency(COALESCE(p.address_country, p.country_code)),
      p.default_currency,
      'CAD'
    )
WHERE COALESCE(
        public.country_to_currency(COALESCE(p.address_country, p.country_code)),
        p.default_currency,
        'CAD'
      ) IS DISTINCT FROM p.default_currency
  AND EXISTS (
    SELECT 1 FROM public.currencies c
    WHERE c.code = COALESCE(
      public.country_to_currency(COALESCE(p.address_country, p.country_code)),
      p.default_currency,
      'CAD'
    )
  );

-- 4) New sign-ups default to a CAD wallet
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, email, account_status, kyc_framework_version, default_currency)
    VALUES (NEW.id, NEW.email, 'pending_verification', 2, 'CAD')
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.wallets (user_id, currency_code, is_default) VALUES
        (NEW.id, 'CAD', true),
        (NEW.id, 'USD', false);

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