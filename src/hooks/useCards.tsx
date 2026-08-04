import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction, stringifyErrorValue } from '@/lib/invokeEdgeFunction';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type CardType = 'virtual' | 'physical' | 'debit' | 'debit_visa' | 'credit';
export type CardNetwork = 'visa' | 'mastercard';

export interface Card {
  id: string;
  user_id: string;
  card_type: CardType;
  card_network: CardNetwork;
  last_four: string;
  expiry_month: number | null;
  expiry_year: number | null;
  cardholder_name: string;
  status: 'active' | 'frozen' | 'cancelled';
  spending_limit: number;
  credit_limit: number | null;
  funding_source: string;
  wallet_id: string | null;
  balance: number;
  currency_code: string | null;
  expires_at: string;
  created_at: string;
}

/** Returned at issuance — full PAN/CVV are also stored encrypted server-side. */
export type CreatedCardResult = Card & {
  pan?: string;
  cvv?: string;
};

export type RevealedCardSecrets = {
  pan: string;
  cvv: string;
  last_four: string;
  expiry_month: number | null;
  expiry_year: number | null;
  cardholder_name: string;
  card_network: CardNetwork;
};

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
      return (data || []).map((c) => ({
        ...c,
        balance: Number((c as Card).balance ?? 0),
      })) as Card[];
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
      card_type: CardType;
      card_network: CardNetwork;
      cardholder_name: string;
      spending_limit?: number;
      credit_limit?: number | null;
      wallet_id?: string | null;
      currency_code?: string | null;
      initial_fund?: number;
      external?: {
        last_four: string;
        expiry_month: number;
        expiry_year: number;
      };
    }) => {
      if (!user) throw new Error('Not authenticated');

      const isExternal = !!input.external;
      const isCredit = input.card_type === 'credit';

      if (!isExternal) {
        if (isCredit && !input.credit_limit) {
          throw new Error('Credit limit is required for credit cards');
        }




        const res = await invokeEdgeFunction<{
          card?: Card;
          pan?: string;
          cvv?: string;
          warning?: string;
        }>('virtual-card-ops', {
          action: 'create',
          card_type: input.card_type,
          card_network: input.card_network,
          cardholder_name: input.cardholder_name.trim(),
          spending_limit: input.spending_limit ?? 5000,
          credit_limit: isCredit ? input.credit_limit : null,
          wallet_id: isCredit ? null : input.wallet_id,
          currency_code: input.currency_code ?? null,
          initial_fund: !isCredit && Number(input.initial_fund) > 0 ? Number(input.initial_fund) : undefined,
        });
        if (!res.card) throw new Error('Card creation failed');

        if (res.warning) toast.warning(res.warning);

        return {
          ...res.card,
          balance: Number(res.card.balance ?? 0),
          pan: res.pan,
          cvv: res.cvv,
        } as CreatedCardResult;
      }

      if (!input.wallet_id) throw new Error('Select a wallet to fund with this card');

      const { data, error } = await supabase
        .from('cards')
        .insert({
          user_id: user.id,
          card_type: input.card_type,
          card_network: input.card_network,
          cardholder_name: input.cardholder_name,
          last_four: input.external!.last_four,
          expiry_month: input.external!.expiry_month,
          expiry_year: input.external!.expiry_year,
          spending_limit: input.spending_limit ?? 5000,
          credit_limit: null,
          funding_source: 'external',
          wallet_id: input.wallet_id,
          currency_code: input.currency_code ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as CreatedCardResult;
    },
    onSuccess: () => {
      toast.success('Card created');
      invalidate();
    },
    onError: (e: unknown) => toast.error(stringifyErrorValue(e) || 'Failed to create card'),
  });

  const revealCardSecrets = useMutation({
    mutationFn: async (input: { card_id: string; pin: string }): Promise<RevealedCardSecrets> => {
      const res = await invokeEdgeFunction<RevealedCardSecrets>('virtual-card-ops', {
        action: 'reveal',
        card_id: input.card_id,
        pin: input.pin,
      });
      if (!res.pan || !res.cvv) throw new Error('Could not load card details');
      return res;
    },
    onError: (e: unknown) => toast.error(stringifyErrorValue(e) || 'Could not reveal card details'),
  });

  const updateCardStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'frozen' | 'cancelled' }) => {
      const { error } = await supabase.from('cards').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: unknown) => toast.error(stringifyErrorValue(e) || 'Failed to update card'),
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
    onError: (e: unknown) => toast.error(stringifyErrorValue(e) || 'Failed to update card'),
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
    onError: (e: unknown) => toast.error(stringifyErrorValue(e) || 'Failed to delete card'),
  });

  const fundCard = useMutation({
    mutationFn: async (input: { card_id: string; wallet_id: string; amount: number }) => {
      return invokeEdgeFunction('virtual-card-ops', { action: 'fund', ...input });
    },
    onSuccess: () => {
      toast.success('Card funded');
      invalidate();
      qc.invalidateQueries({ queryKey: ['wallets'] });
    },
    onError: (e: unknown) => toast.error(stringifyErrorValue(e) || 'Funding failed'),
  });

  const transferBetweenCards = useMutation({
    mutationFn: async (input: { from_card_id: string; to_card_id: string; amount: number }) => {
      return invokeEdgeFunction('virtual-card-ops', { action: 'transfer', ...input });
    },
    onSuccess: () => {
      toast.success('Transfer complete');
      invalidate();
    },
    onError: (e: unknown) => toast.error(stringifyErrorValue(e) || 'Transfer failed'),
  });

  return {
    createCard,
    revealCardSecrets,
    updateCardStatus,
    updateCard,
    deleteCard,
    fundCard,
    transferBetweenCards,
  };
};
