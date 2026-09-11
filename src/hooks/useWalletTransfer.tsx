import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateFinancialBooks } from "@/lib/finance/invalidateFinancialBooks";
import { useAuth } from './useAuth';

export type WalletTransferInput = {
  from_wallet_id: string;
  to_wallet_id: string;
  from_currency: string;
  to_currency: string;
  from_amount: number;
  effective_rate?: number | null;
  fee_amount?: number;
};

export function useWalletTransfer() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: WalletTransferInput) => {
      try {
        return await executeWalletFxSwap(input);
      } catch (error) {
        throw new Error(await invokeTransferError(error));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallets', user?.id] });
      qc.invalidateQueries({ queryKey: ['wallets'] });
      qc.invalidateQueries({ queryKey: ['fx_rates'] });
      invalidateFinancialBooks(qc);
    },
  });
}
