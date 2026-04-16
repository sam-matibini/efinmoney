import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface LinkedFundingSource {
  id: string;
  user_id: string;
  source_type: 'bank' | 'card';
  display_name: string;
  institution: string | null;
  last_four: string;
  currency_code: string;
  is_active: boolean;
  created_at: string;
}

export const useFundingSources = (sourceType?: 'bank' | 'card') => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['linked_funding_sources', user?.id, sourceType ?? 'all'],
    queryFn: async (): Promise<LinkedFundingSource[]> => {
      if (!user) return [];
      let q = supabase
        .from('linked_funding_sources')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (sourceType) q = q.eq('source_type', sourceType);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as LinkedFundingSource[];
    },
    enabled: !!user,
  });
};
