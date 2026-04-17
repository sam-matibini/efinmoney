import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FxRate {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  markup_rate: number;
  effective_rate: number;
  source: string;
  valid_from: string;
  valid_until: string | null;
  created_at?: string;
}

// Fetch most-recent rate per from→to pair (currently valid)
export const useFxRates = () => {
  return useQuery({
    queryKey: ['fx_rates'],
    queryFn: async (): Promise<FxRate[]> => {
      const { data, error } = await supabase
        .from('fx_rates')
        .select('*')
        .or('valid_until.is.null,valid_until.gt.' + new Date().toISOString())
        .order('valid_from', { ascending: false })
        .limit(500);

      if (error) {
        console.error('Error fetching FX rates:', error);
        throw error;
      }

      // Deduplicate to keep only the latest per pair
      const seen = new Set<string>();
      const latest: FxRate[] = [];
      for (const r of data || []) {
        const key = `${r.from_currency}->${r.to_currency}`;
        if (!seen.has(key)) {
          seen.add(key);
          latest.push(r as FxRate);
        }
      }
      return latest.sort((a, b) => a.from_currency.localeCompare(b.from_currency));
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });
};

export const useExchangeRate = (fromCurrency: string, toCurrency: string) => {
  return useQuery({
    queryKey: ['fx_rate', fromCurrency, toCurrency],
    queryFn: async (): Promise<FxRate | null> => {
      const { data, error } = await supabase
        .from('fx_rates')
        .select('*')
        .eq('from_currency', fromCurrency)
        .eq('to_currency', toCurrency)
        .or('valid_until.is.null,valid_until.gt.' + new Date().toISOString())
        .order('valid_from', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching exchange rate:', error);
        throw error;
      }

      return data as FxRate | null;
    },
    enabled: !!fromCurrency && !!toCurrency,
  });
};

// Returns timestamp of the most recently refreshed rate
export const useFxRatesLastUpdated = () => {
  return useQuery({
    queryKey: ['fx_rates_last_updated'],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('fx_rates')
        .select('valid_from')
        .order('valid_from', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.valid_from ?? null;
    },
    refetchInterval: 60000,
  });
};
