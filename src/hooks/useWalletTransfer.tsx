import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeTransferError } from '@/lib/walletTransfer';
import { useAuth } from './useAuth';

export type WalletTransferInput = {
  from_wallet_id: string;
  to_wallet_id: string;
  from_currency: string;
  to_currency: string;
  from_amount: number;
};

export function useWalletTransfer() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: WalletTransferInput) => {
      const { data, error } = await supabase.functions.invoke('fx-engine', {
        body: { action: 'execute', ...input },
      });
      if (error) throw new Error(await invokeTransferError(error));
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as { success: boolean; message?: string; transaction?: unknown };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallets', user?.id] });
      qc.invalidateQueries({ queryKey: ['wallets'] });
      qc.invalidateQueries({ queryKey: ['fx_rates'] });
      qc.invalidateQueries({ queryKey: ['ledger-fx'] });
    },
  });
}
