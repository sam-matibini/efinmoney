-- profiles.default_currency has always defaulted to 'USD' regardless of where the
-- person actually lives, so every non-US customer carried the wrong currency.
-- Derive it from the profile's country instead, and keep it in sync as the
-- country is filled in during onboarding / KYC.
--
-- default_currency is FK-constrained to currencies(code), so every write is
-- guarded by an EXISTS check — an unmapped or unseeded code leaves the value
-- untouched rather than failing the write.

-- ── country → currency ────────────────────────────────────────────────────
-- Accepts ISO-2 ('CA') or ISO-3 ('CAN'). Returns NULL when unmapped.
CREATE OR REPLACE FUNCTION public.country_to_currency(_country text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE upper(btrim(COALESCE(_country, '')))
    -- ISO-3 forms seen in existing rows
    WHEN 'USA' THEN 'USD' WHEN 'CAN' THEN 'CAD' WHEN 'GBR' THEN 'GBP'
    WHEN 'AUS' THEN 'AUD' WHEN 'NZL' THEN 'NZD' WHEN 'NGA' THEN 'NGN'
    WHEN 'GHA' THEN 'GHS' WHEN 'KEN' THEN 'KES' WHEN 'ZAF' THEN 'ZAR'
    WHEN 'ZMB' THEN 'ZMW' WHEN 'UGA' THEN 'UGX' WHEN 'TZA' THEN 'TZS'
    WHEN 'RWA' THEN 'RWF' WHEN 'CMR' THEN 'XAF' WHEN 'CIV' THEN 'XOF'
    WHEN 'SEN' THEN 'XOF' WHEN 'EGY' THEN 'EGP' WHEN 'MAR' THEN 'MAD'
    WHEN 'IND' THEN 'INR' WHEN 'BRA' THEN 'BRL' WHEN 'MEX' THEN 'MXN'
    WHEN 'ARE' THEN 'AED' WHEN 'SAU' THEN 'SAR' WHEN 'TUR' THEN 'TRY'
    WHEN 'CHE' THEN 'CHF' WHEN 'JPN' THEN 'JPY' WHEN 'CHN' THEN 'CNY'
    WHEN 'HKG' THEN 'HKD' WHEN 'SGP' THEN 'SGD'
    WHEN 'FRA' THEN 'EUR' WHEN 'DEU' THEN 'EUR' WHEN 'ESP' THEN 'EUR'
    WHEN 'ITA' THEN 'EUR' WHEN 'NLD' THEN 'EUR' WHEN 'IRL' THEN 'EUR'
    -- ISO-2
    WHEN 'US' THEN 'USD' WHEN 'CA' THEN 'CAD' WHEN 'GB' THEN 'GBP'
    WHEN 'AU' THEN 'AUD' WHEN 'NZ' THEN 'NZD' WHEN 'CH' THEN 'CHF'
    WHEN 'JP' THEN 'JPY' WHEN 'CN' THEN 'CNY' WHEN 'HK' THEN 'HKD'
    WHEN 'SG' THEN 'SGD'
    -- Eurozone
    WHEN 'IE' THEN 'EUR' WHEN 'FR' THEN 'EUR' WHEN 'DE' THEN 'EUR'
    WHEN 'ES' THEN 'EUR' WHEN 'IT' THEN 'EUR' WHEN 'NL' THEN 'EUR'
    WHEN 'BE' THEN 'EUR' WHEN 'PT' THEN 'EUR' WHEN 'AT' THEN 'EUR'
    WHEN 'FI' THEN 'EUR' WHEN 'GR' THEN 'EUR' WHEN 'LU' THEN 'EUR'
    WHEN 'CY' THEN 'EUR' WHEN 'EE' THEN 'EUR' WHEN 'LV' THEN 'EUR'
    WHEN 'LT' THEN 'EUR' WHEN 'MT' THEN 'EUR' WHEN 'SI' THEN 'EUR'
    WHEN 'SK' THEN 'EUR' WHEN 'HR' THEN 'EUR'
    -- Rest of Europe
    WHEN 'NO' THEN 'NOK' WHEN 'SE' THEN 'SEK' WHEN 'DK' THEN 'DKK'
    WHEN 'IS' THEN 'ISK' WHEN 'PL' THEN 'PLN' WHEN 'CZ' THEN 'CZK'
    WHEN 'HU' THEN 'HUF' WHEN 'RO' THEN 'RON' WHEN 'BG' THEN 'BGN'
    WHEN 'RS' THEN 'RSD' WHEN 'UA' THEN 'UAH' WHEN 'RU' THEN 'RUB'
    -- Africa
    WHEN 'NG' THEN 'NGN' WHEN 'GH' THEN 'GHS' WHEN 'KE' THEN 'KES'
    WHEN 'ZA' THEN 'ZAR' WHEN 'ZM' THEN 'ZMW' WHEN 'UG' THEN 'UGX'
    WHEN 'TZ' THEN 'TZS' WHEN 'RW' THEN 'RWF' WHEN 'ET' THEN 'ETB'
    WHEN 'MW' THEN 'MWK' WHEN 'MZ' THEN 'MZN' WHEN 'BW' THEN 'BWP'
    WHEN 'NA' THEN 'NAD' WHEN 'AO' THEN 'AOA' WHEN 'CD' THEN 'CDF'
    WHEN 'LR' THEN 'LRD' WHEN 'GM' THEN 'GMD' WHEN 'TN' THEN 'TND'
    WHEN 'DZ' THEN 'DZD' WHEN 'LY' THEN 'LYD' WHEN 'SD' THEN 'SDG'
    WHEN 'EG' THEN 'EGP' WHEN 'MA' THEN 'MAD'
    WHEN 'CI' THEN 'XOF' WHEN 'SN' THEN 'XOF' WHEN 'BF' THEN 'XOF'
    WHEN 'ML' THEN 'XOF' WHEN 'NE' THEN 'XOF' WHEN 'TG' THEN 'XOF'
    WHEN 'BJ' THEN 'XOF' WHEN 'GW' THEN 'XOF'
    WHEN 'CM' THEN 'XAF' WHEN 'GA' THEN 'XAF' WHEN 'CG' THEN 'XAF'
    WHEN 'TD' THEN 'XAF' WHEN 'CF' THEN 'XAF' WHEN 'GQ' THEN 'XAF'
    -- Asia-Pacific
    WHEN 'IN' THEN 'INR' WHEN 'KR' THEN 'KRW' WHEN 'TW' THEN 'TWD'
    WHEN 'TH' THEN 'THB' WHEN 'VN' THEN 'VND' WHEN 'PH' THEN 'PHP'
    WHEN 'ID' THEN 'IDR' WHEN 'MY' THEN 'MYR' WHEN 'PK' THEN 'PKR'
    WHEN 'BD' THEN 'BDT' WHEN 'LK' THEN 'LKR' WHEN 'NP' THEN 'NPR'
    WHEN 'MM' THEN 'MMK' WHEN 'KH' THEN 'KHR' WHEN 'FJ' THEN 'FJD'
    -- Americas & Middle East
    WHEN 'BR' THEN 'BRL' WHEN 'MX' THEN 'MXN' WHEN 'AR' THEN 'ARS'
    WHEN 'CL' THEN 'CLP' WHEN 'CO' THEN 'COP' WHEN 'PE' THEN 'PEN'
    WHEN 'UY' THEN 'UYU' WHEN 'JM' THEN 'JMD' WHEN 'TT' THEN 'TTD'
    WHEN 'DO' THEN 'DOP' WHEN 'GT' THEN 'GTQ' WHEN 'CR' THEN 'CRC'
    WHEN 'AE' THEN 'AED' WHEN 'SA' THEN 'SAR' WHEN 'TR' THEN 'TRY'
    WHEN 'IL' THEN 'ILS' WHEN 'QA' THEN 'QAR' WHEN 'KW' THEN 'KWD'
    WHEN 'BH' THEN 'BHD' WHEN 'OM' THEN 'OMR' WHEN 'JO' THEN 'JOD'
    WHEN 'LB' THEN 'LBP' WHEN 'IQ' THEN 'IQD'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.country_to_currency(text) IS
  'ISO-2 or ISO-3 country code to its primary ISO-4217 currency. NULL when unmapped.';

-- ── keep default_currency aligned with the country ────────────────────────
CREATE OR REPLACE FUNCTION public.sync_default_currency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_ccy text;
BEGIN
  v_ccy := public.country_to_currency(
    COALESCE(NEW.address_country, NEW.country_code)
  );

  -- Unmapped country, or currency not seeded: leave the existing value alone.
  IF v_ccy IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v_ccy) THEN
    RETURN NEW;
  END IF;

  NEW.default_currency := v_ccy;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_default_currency ON public.profiles;
CREATE TRIGGER trg_profiles_default_currency
  BEFORE INSERT OR UPDATE OF address_country, country_code ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_default_currency();

-- ── backfill existing rows ────────────────────────────────────────────────
UPDATE public.profiles p
SET default_currency = c.code
FROM public.currencies c
WHERE c.code = public.country_to_currency(COALESCE(p.address_country, p.country_code))
  AND p.default_currency IS DISTINCT FROM c.code;
