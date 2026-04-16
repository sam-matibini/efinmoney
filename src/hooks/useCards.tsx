import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Card {
  id: string;
  user_id: string;
  card_type: 'virtual' | 'physical';
  card_network: 'visa' | 'mastercard';
  last_four: string;
  cardholder_name: string;
  status: 'active' | 'frozen' | 'cancelled';
  spending_limit: number;
  wallet_id: string | null;
  expires_at: string;
  created_at: string;
}

export const useCards = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['cards', user?.id],
    queryFn: async (): Promise<Card[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Card[];
    },
    enabled: !!user,
  });
};

export const useCardMutations = () => {
  const qc = useQueryClient();
  const { user } = useAuth();

  const invalidate = () => qc.invalidateQueries({ queryKey: ['cards', user?.id] });

  const createCard = useMutation({
    mutationFn: async (input: {
      card_type: 'virtual' | 'physical';
      card_network: 'visa' | 'mastercard';
      cardholder_name: string;
      spending_limit?: number;
      wallet_id?: string | null;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const last_four = String(Math.floor(1000 + Math.random() * 9000));
      const { data, error } = await supabase
        .from('cards')
        .insert({
          user_id: user.id,
          card_type: input.card_type,
          card_network: input.card_network,
          cardholder_name: input.cardholder_name,
          last_four,
          spending_limit: input.spending_limit ?? 5000,
          wallet_id: input.wallet_id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Card created');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create card'),
  });

  const updateCardStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'frozen' | 'cancelled' }) => {
      const { error } = await supabase.from('cards').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message || 'Failed to update card'),
  });

  const updateCard = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Card> & { id: string }) => {
      const { error } = await supabase.from('cards').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Card updated');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update card'),
  });

  const deleteCard = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cards').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Card deleted');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to delete card'),
  });

  return { createCard, updateCardStatus, updateCard, deleteCard };
};
