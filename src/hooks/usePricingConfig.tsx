import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PricingConfigEntry {
  key: string;
  value: number;
  description: string | null;
}

export const usePricingConfig = () => {
  return useQuery({
    queryKey: ['pricing_config'],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('pricing_config')
        .select('key, value');
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((row: { key: string; value: number | string }) => {
        map[row.key] = Number(row.value);
      });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
};
