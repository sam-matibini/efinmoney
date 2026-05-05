import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  currency_code: string;
  source_wallet_id: string | null;
  target_date: string | null;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface CreateSavingsGoalInput {
  name: string;
  target_amount: number;
  currency_code: string;
  source_wallet_id?: string | null;
  target_date?: string | null;
}

export const useSavingsGoals = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['savings_goals', user?.id],
    queryFn: async (): Promise<SavingsGoal[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('savings_goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as SavingsGoal[];
    },
    enabled: !!user,
  });
};

export const useCreateSavingsGoal = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSavingsGoalInput): Promise<SavingsGoal> => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('savings_goals')
        .insert({ user_id: user.id, ...input })
        .select()
        .single();
      if (error) throw error;
      return data as SavingsGoal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings_goals'] }),
  });
};

export const useContributeToGoal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ goal, amount }: { goal: SavingsGoal; amount: number }) => {
      const newAmount = Number(goal.current_amount) + amount;
      const completed = newAmount >= Number(goal.target_amount);
      const { error } = await supabase
        .from('savings_goals')
        .update({
          current_amount: newAmount,
          status: completed ? 'completed' : goal.status,
        })
        .eq('id', goal.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings_goals'] }),
  });
};

export const useDeleteSavingsGoal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('savings_goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savings_goals'] }),
  });
};

