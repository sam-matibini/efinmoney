import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  card_number: string | null;
  cvv: string | null;
  expiry_month: number | null;
  expiry_year: number | null;
  cardholder_name: string;
  status: 'active' | 'frozen' | 'cancelled';
  spending_limit: number;
  credit_limit: number | null;
  funding_source: string;
  wallet_id: string | null;
  expires_at: string;
  created_at: string;
}

// Generate a 16-digit PAN with valid Luhn check digit
const generatePan = (network: CardNetwork): string => {
  const prefix = network === 'visa' ? '4' : '5' + Math.floor(1 + Math.random() * 5);
  let body = prefix;
  while (body.length < 15) body += Math.floor(Math.random() * 10);
  // Luhn checksum
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = parseInt(body[body.length - 1 - i], 10);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return body + check;
};

const generateCvv = () => String(Math.floor(100 + Math.random() * 900));

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
      card_type: CardType;
      card_network: CardNetwork;
      cardholder_name: string;
      spending_limit?: number;
      credit_limit?: number | null;
      wallet_id?: string | null;
      // External (linked) card mode — provide last_four + expiry, never persist full PAN/CVV.
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
        if (!isCredit && !input.wallet_id) {
          throw new Error('A linked wallet is required for debit cards');
        }
        if (isCredit && !input.credit_limit) {
          throw new Error('Credit limit is required for credit cards');
        }
      } else if (!input.wallet_id) {
        throw new Error('Select a wallet to fund with this card');
      }

      let last_four: string;
      let card_number: string | null;
      let cvv: string | null;
      let expMonth: number;
      let expYear: number;

      if (isExternal) {
        last_four = input.external!.last_four;
        card_number = null;
        cvv = null;
        expMonth = input.external!.expiry_month;
        expYear = input.external!.expiry_year;
      } else {
        const pan = generatePan(input.card_network);
        last_four = pan.slice(-4);
        card_number = pan;
        cvv = generateCvv();
        const now = new Date();
        expYear = now.getFullYear() + 4;
        expMonth = now.getMonth() + 1;
      }

      const { data, error } = await supabase
        .from('cards')
        .insert({
          user_id: user.id,
          card_type: input.card_type,
          card_network: input.card_network,
          cardholder_name: input.cardholder_name,
          last_four,
          card_number,
          cvv,
          expiry_month: expMonth,
          expiry_year: expYear,
          spending_limit: input.spending_limit ?? 5000,
          credit_limit: isCredit ? input.credit_limit : null,
          funding_source: isExternal ? 'external' : isCredit ? 'credit_line' : 'wallet',
          wallet_id: isCredit && !isExternal ? null : input.wallet_id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Card;
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
