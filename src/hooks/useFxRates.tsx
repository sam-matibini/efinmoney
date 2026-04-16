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
}

export const useFxRates = () => {
  return useQuery({
    queryKey: ['fx_rates'],
    queryFn: async (): Promise<FxRate[]> => {
      const { data, error } = await supabase
        .from('fx_rates')
        .select('*')
        .is('valid_until', null)
        .order('from_currency');

      if (error) {
        console.error('Error fetching FX rates:', error);
        throw error;
      }

      return data || [];
    },
    refetchInterval: 60000, // refresh every 60s
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
        .is('valid_until', null)
        .maybeSingle();

      if (error) {
        console.error('Error fetching exchange rate:', error);
        throw error;
      }

      return data;
    },
    enabled: !!fromCurrency && !!toCurrency,
  });
};
