import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  currency_type: 'fiat' | 'crypto';
  decimal_places: number;
  is_active: boolean;
  flag_emoji: string | null;
}

export const useCurrencies = () => {
  return useQuery({
    queryKey: ['currencies'],
    queryFn: async (): Promise<Currency[]> => {
      const { data, error } = await supabase
        .from('currencies')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('Error fetching currencies:', error);
        throw error;
      }

      return data || [];
    },
  });
};
