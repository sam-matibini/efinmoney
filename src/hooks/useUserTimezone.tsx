import { useProfile } from './useProfile';
import { useGeoDetect } from './useGeoDetect';
import { browserTimezone } from '@/lib/datetime';
import { countryTimezone } from '@/lib/greeting';

/**
 * The viewer's timezone: browser setting first, then IP detection,
 * then their domicile country, then the system clock.
 */
export const useUserTimezone = (): string => {
  const { data: profile } = useProfile();
  const { data: geo } = useGeoDetect();

  return (
    browserTimezone() ||
    geo?.timezone ||
    countryTimezone(profile?.address_country || profile?.country_code) ||
    'America/Chicago'
  );
};
