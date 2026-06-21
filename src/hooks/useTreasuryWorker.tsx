import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

export type ProviderBalanceRow = {
  id: string;
  provider: string;
  currency: string;
  available_amount: number;
  pending_amount: number;
  synced_at: string;
};

export type SettlementJob = {
  id: string;
  corridor: string;
  status: string;
  source_provider: string;
  dest_provider: string;
  source_currency: string;
  dest_currency: string;
  source_amount: number | null;
  dest_amount_needed: number;
  dest_amount_filled: number;
  stripe_payout_id: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type PendingTransfer = {
  id: string;
  recipient_name: string;
  target_amount: number;
  target_currency: string;
  source_amount: number;
  source_currency: string;
  recipient_country: string;
  created_at: string;
  failure_reason: string | null;
};

async function invokeEdgeFunction<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, body ? { body } : undefined);
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => ({}));
      const msg = (payload as { error?: string })?.error || error.message;
      throw new Error(msg);
    }
    const hint =
      /failed to fetch|cors|network/i.test(error.message)
        ? `${error.message} — deploy edge functions treasury-sync-balances and treasury-worker to Supabase first.`
        : error.message;
    throw new Error(hint);
  }
  if ((data as { error?: string })?.error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

export function useTreasuryWorker() {
  const qc = useQueryClient();

  // Read last-synced balances from DB (no edge function needed to display the page)
  const balances = useQuery({
    queryKey: ["treasury-worker", "balances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treasury_provider_balances")
        .select("*")
        .order("provider")
        .order("currency");
      if (error) throw error;
      return (data ?? []) as ProviderBalanceRow[];
    },
    refetchInterval: 30_000,
  });

  const pendingTransfers = useQuery({
    queryKey: ["treasury-worker", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("id, recipient_name, target_amount, target_currency, source_amount, source_currency, recipient_country, created_at, failure_reason")
        .eq("status", "pending_liquidity")
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PendingTransfer[];
    },
    refetchInterval: 30_000,
  });

  const settlementJobs = useQuery({
    queryKey: ["treasury-worker", "jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treasury_settlement_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as SettlementJob[];
    },
    refetchInterval: 30_000,
  });

  const syncBalances = useMutation({
    mutationFn: async () => {
      return invokeEdgeFunction<{ ok: boolean; balances: ProviderBalanceRow[] }>("treasury-sync-balances");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treasury-worker"] });
    },
  });

  const runWorker = useMutation({
    mutationFn: async (syncOnly = false) => {
      return invokeEdgeFunction("treasury-worker", { sync_only: syncOnly });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treasury-worker"] });
      qc.invalidateQueries({ queryKey: ["all-transfers"] });
    },
  });

  return {
    balances,
    pendingTransfers,
    settlementJobs,
    syncBalances,
    runWorker,
  };
}
