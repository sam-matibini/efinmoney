import { useProfile } from './useProfile';
import { countryToCurrency } from '@/lib/currency';
import { SYSTEM_DEFAULT_CURRENCY, resolveBaseCurrency } from '@/lib/systemDefaults';
import { useGeoDetect } from './useGeoDetect';

/**
 * The user's base currency: derived from their domicile country, then their
 * stored preference, then the detected country, then the system default (CAD).
 */
export const useBaseCurrency = (): string => {
  const { data: profile } = useProfile();
  const { data: geo } = useGeoDetect();

  const fromProfileCountry = countryToCurrency(
    profile?.address_country || profile?.country_code,
  );
  const fromGeo = countryToCurrency(geo?.country);

  return resolveBaseCurrency(
    fromProfileCountry,
    profile?.default_currency || fromGeo || SYSTEM_DEFAULT_CURRENCY,
  );
};
