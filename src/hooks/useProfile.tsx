import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Profile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  kyc_status: string;
  kyc_tier: string;
  default_currency: string | null;
  country_code: string | null;
  risk_score: number | null;
  account_number: string | null;
  efin_tag: string | null;
  kyc_framework_version: number | null;
}

export const useProfile = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async (): Promise<Profile | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, kyc_status, kyc_tier, default_currency, country_code, risk_score, account_number, efin_tag, kyc_framework_version')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as Profile) || null;
    },
    enabled: !!user,
  });
};
