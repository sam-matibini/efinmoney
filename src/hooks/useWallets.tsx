import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Wallet {
  wallet_id: string;
  currency_code: string;
  currency_name: string;
  symbol: string;
  flag_emoji: string | null;
  balance: number;
  status: 'active' | 'frozen' | 'suspended' | 'closed';
  is_default: boolean;
}

export const useWallets = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['wallets', user?.id],
    queryFn: async (): Promise<Wallet[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .rpc('get_user_wallet_balances', { p_user_id: user.id });

      if (error) {
        console.error('Error fetching wallets:', error);
        throw error;
      }

      return (data || []) as Wallet[];
    },
    enabled: !!user,
  });
};
