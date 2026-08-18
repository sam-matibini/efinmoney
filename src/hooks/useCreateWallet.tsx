import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export const useCreateWallet = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (currencyCode: string) => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('wallets')
        .insert({
          user_id: user.id,
          currency_code: currencyCode,
          is_default: false,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating wallet:', error);
        if (error.code === '23505') {
          throw new Error(`You already have a ${currencyCode} wallet.`);
        }
        throw new Error(error.message || 'Failed to create wallet');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
};