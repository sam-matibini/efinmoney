import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SafeguardingSnapshot {
  id: string;
  snapshot_date: string;
  currency_code: string;
  customer_wallet_liability: number;
  ledger_trust_balance: number;
  bank_trust_balance: number | null;
  surplus_deficit: number;
  status: "ok" | "variance" | "breach";
  updated_at: string;
}

// Latest persisted three-way safeguarding snapshot (one row per currency).
export const useSafeguardingSnapshots = () =>
  useQuery({
    queryKey: ["safeguarding-snapshots"],
    queryFn: async (): Promise<SafeguardingSnapshot[]> => {
      // safeguarding_snapshots is created in migration 20260623120000 but the generated
      // supabase types haven't been regenerated yet. Cast to any — RLS gates reads to roles.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: latest, error: e1 } = await db
        .from("safeguarding_snapshots")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e1) throw e1;
      if (!latest) return [];

      const { data, error } = await db
        .from("safeguarding_snapshots")
        .select("*")
        .eq("snapshot_date", latest.snapshot_date)
        .order("currency_code");
      if (error) throw error;
      return (data || []) as SafeguardingSnapshot[];
    },
  });

// Runs the edge function to recompute + persist a fresh snapshot, then refreshes the view.
export const useRunSafeguardingCheck = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("safeguarding-check", { body: {} });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["safeguarding-snapshots"] }),
  });
};
