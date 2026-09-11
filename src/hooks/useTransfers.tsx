import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { track } from '@/lib/analytics';
import { invalidateFinancialBooks } from '@/lib/finance/invalidateFinancialBooks';

export interface Transfer {
  id: string;
  sender_id: string;
  sender_wallet_id: string;
  recipient_name: string;
  recipient_phone: string | null;
  recipient_account: string | null;
  recipient_bank_code?: string | null;
  recipient_bank_name?: string | null;
  recipient_country: string;
  transfer_type: 'internal' | 'mobile_money' | 'bank' | 'crypto' | 'bill_payment' | 'domestic_canada' | 'card_push';
  payout_method: string | null;
  source_currency: string;
  target_currency: string;
  source_amount: number;
  target_amount: number;
  exchange_rate: number;
  fee_amount: number;
  status: 'initiated' | 'funded' | 'processing' | 'completed' | 'failed' | 'reversed' | 'expired' | 'pending_liquidity' | 'pending_ops';
  provider_reference: string | null;
  failure_reason: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTransferInput {
  sender_wallet_id: string;
  recipient_name: string;
  recipient_phone?: string;
  recipient_account?: string;
  recipient_bank_code?: string;
  recipient_bank_name?: string;
  recipient_country: string;
  transfer_type: 'internal' | 'mobile_money' | 'bank' | 'crypto' | 'bill_payment' | 'domestic_canada';
  payout_method?: string;
  source_currency: string;
  target_currency: string;
  source_amount: number;
  target_amount: number;
  exchange_rate: number;
  fee_amount: number;
  funding_source?: 'wallet' | 'card' | 'bank';
}

export const useTransfers = (limit = 10) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['transfers', user?.id, limit],
    queryFn: async (): Promise<Transfer[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('transfers')
        .select('*')
        .eq('sender_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching transfers:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!user,
  });
};

export const useCancelTransfer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transfer_id: string) => {
      const { data, error } = await supabase.functions.invoke('cancel-transfer', {
        body: { transfer_id },
      });
      if (error) throw new Error(error.message || 'Failed to cancel transfer');
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_d, transfer_id) => {
      track('transfer_cancelled', { transfer_id });
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
  });
};

export const useCreateTransfer = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTransferInput): Promise<Transfer> => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('transfers')
        .insert({
          sender_id: user.id,
          ...input,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating transfer:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (data) => {
      track('transfer_initiated', {
        transfer_id: data.id,
        source_amount: data.source_amount,
        source_currency: data.source_currency,
        target_currency: data.target_currency,
        recipient_country: data.recipient_country,
        transfer_type: data.transfer_type,
      });
      if (data.status === 'completed') {
        track('transfer_completed', { transfer_id: data.id });
      }
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      invalidateFinancialBooks(queryClient);
    },
  });
};
