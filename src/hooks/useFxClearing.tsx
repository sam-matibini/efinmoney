import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FxClearingBalance {
  account_id: string;
  code: string;
  currency_code: string;
  balance: number;
}

// Current native-currency balance of every "FX Clearing - <CCY>" account —
// the plug the 2026-06-27 auto-balancing trigger posts when a cross-currency
// journal doesn't balance per currency. Non-zero here means real, unresolved
// exposure sitting outside FX Gain/Loss.
export const useFxClearingBalances = () =>
  useQuery({
    queryKey: ["fx-clearing-balances"],
    queryFn: async (): Promise<FxClearingBalance[]> => {
      const { data: accounts, error: accountsError } = await supabase
        .from("ledger_accounts")
        .select("id, code, currency_code")
        .like("name", "FX Clearing - %");
      if (accountsError) throw accountsError;
      if (!accounts || accounts.length === 0) return [];

      const { data: entries, error: entriesError } = await supabase
        .from("ledger_entries")
        .select("account_id, debit_amount, credit_amount")
        .in("account_id", accounts.map((a) => a.id));
      if (entriesError) throw entriesError;

      const totals = new Map<string, { debit: number; credit: number }>();
      (entries || []).forEach((e) => {
        const cur = totals.get(e.account_id) || { debit: 0, credit: 0 };
        totals.set(e.account_id, {
          debit: cur.debit + Number(e.debit_amount || 0),
          credit: cur.credit + Number(e.credit_amount || 0),
        });
      });

      return accounts
        .map((a) => {
          const t = totals.get(a.id) || { debit: 0, credit: 0 };
          return { account_id: a.id, code: a.code, currency_code: a.currency_code ?? "", balance: t.debit - t.credit };
        })
        .filter((row) => Math.abs(row.balance) > 0.005)
        .sort((a, b) => a.currency_code.localeCompare(b.currency_code));
    },
  });

export interface FxSweepResult {
  swept_currency: string;
  swept_amount: number;
  posted_to: string;
}

// Manually recognizes every FX Clearing account's current balance to FX Gain (4100)
// or FX Loss (5100), same currency, one shared journal. Role-gated (admin/finance)
// on the database side — deliberately manual, not a cron, since this is a P&L
// recognition decision.
export const useSweepFxClearing = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<FxSweepResult[]> => {
      const { data, error } = await supabase.rpc("sweep_fx_clearing_to_gain_loss");
      if (error) throw error;
      return (data || []) as FxSweepResult[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fx-clearing-balances"] });
      queryClient.invalidateQueries({ queryKey: ["trial-balance"] });
      queryClient.invalidateQueries({ queryKey: ["trial-balance-currencies"] });
    },
  });
};
