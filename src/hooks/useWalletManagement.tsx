import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export const useWalletManagement = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const setDefaultMutation = useMutation({
    mutationFn: async (walletId: string) => {
      if (!user) throw new Error('Not authenticated');

      // First, unset all other wallets as default
      const { error: resetError } = await supabase
        .from('wallets')
        .update({ is_default: false })
        .eq('user_id', user.id);

      if (resetError) throw resetError;

      // Set the selected wallet as default
      const { error } = await supabase
        .from('wallets')
        .update({ is_default: true })
        .eq('id', walletId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      toast.success('Default wallet updated');
    },
    onError: (error) => {
      console.error('Error setting default wallet:', error);
      toast.error('Failed to set default wallet');
    },
  });

  const toggleFreezeMutation = useMutation({
    mutationFn: async ({ walletId, freeze }: { walletId: string; freeze: boolean }) => {
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('wallets')
        .update({ status: freeze ? 'frozen' : 'active' })
        .eq('id', walletId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      toast.success(variables.freeze ? 'Wallet frozen' : 'Wallet unfrozen');
    },
    onError: (error) => {
      console.error('Error toggling wallet freeze:', error);
      toast.error('Failed to update wallet status');
    },
  });

  const updateWalletMutation = useMutation({
    mutationFn: async ({ walletId, data }: { walletId: string; data: { nickname?: string } }) => {
      if (!user) throw new Error('Not authenticated');

      // Note: nickname field would need to be added to wallets table
      // For now, we'll just simulate the update
      const { error } = await supabase
        .from('wallets')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', walletId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
    onError: (error) => {
      console.error('Error updating wallet:', error);
      throw error;
    },
  });

  const deleteWalletMutation = useMutation({
    mutationFn: async ({ walletId, currentBalance }: { walletId: string; currentBalance: number }) => {
      if (!user) throw new Error('Not authenticated');

      // Check if wallet has balance (passed from the UI which has the computed balance)
      if (currentBalance > 0) {
        throw new Error('Cannot delete wallet with remaining balance');
      }

      const { error } = await supabase
        .from('wallets')
        .delete()
        .eq('id', walletId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
    },
    onError: (error) => {
      console.error('Error deleting wallet:', error);
      throw error;
    },
  });

  return {
    setDefault: setDefaultMutation.mutate,
    toggleFreeze: toggleFreezeMutation.mutate,
    updateWallet: async (walletId: string, data: { nickname?: string }) => {
      await updateWalletMutation.mutateAsync({ walletId, data });
    },
    deleteWallet: async (walletId: string, currentBalance: number) => {
      await deleteWalletMutation.mutateAsync({ walletId, currentBalance });
    },
    isSettingDefault: setDefaultMutation.isPending,
    isTogglingFreeze: toggleFreezeMutation.isPending,
    isUpdating: updateWalletMutation.isPending,
    isDeleting: deleteWalletMutation.isPending,
  };
};
