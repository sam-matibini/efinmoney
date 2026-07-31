import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GeoInfo {
  country: string | null;
  timezone: string | null;
  currency: string | null;
}

const CACHE_KEY = 'efin_geo_v1';

const readCache = (): GeoInfo | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as GeoInfo) : null;
  } catch {
    return null;
  }
};

/** Coarse IP geolocation (country + IANA timezone). Fails soft to null. */
export const useGeoDetect = () => {
  return useQuery({
    queryKey: ['geo-detect'],
    queryFn: async (): Promise<GeoInfo | null> => {
      const cached = readCache();
      if (cached) return cached;
      try {
        const { data, error } = await supabase.functions.invoke('geo-detect');
        if (error || !data) return null;
        const geo = data as GeoInfo;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(geo));
        } catch {
          /* ignore */
        }
        return geo;
      } catch {
        return null;
      }
    },
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: false,
  });
};
