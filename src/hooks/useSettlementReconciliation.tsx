import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ReconStatus = "matched" | "variance" | "missing" | "duplicate" | "pending";

export interface ReconRow {
  id: string;
  processor: string;
  processor_settlement_amount: number;
  efinmoney_ledger_amount: number;
  bank_statement_amount: number | null;
  status: ReconStatus;
  variance_amount: number;
  batch_ref: string | null;
  settlement_date: string | null;
  reconciled_by: string | null;
  reconciled_at: string | null;
  notes: string | null;
  created_at: string;
}

export const PROCESSORS = ["stripe", "paysafe", "adyen", "flutterwave", "mtn_momo", "airtel", "other"] as const;

// Amounts within this tolerance are treated as equal.
const TOLERANCE = 0.01;

/** Pure matching rule, reused by the auto-match run and unit-testable. */
export function classifyRow(r: Pick<ReconRow, "processor_settlement_amount" | "efinmoney_ledger_amount" | "bank_statement_amount">): ReconStatus {
  const proc = Number(r.processor_settlement_amount || 0);
  const ledger = Number(r.efinmoney_ledger_amount || 0);
  const bank = r.bank_statement_amount == null ? null : Number(r.bank_statement_amount);
  const ledgerMatches = Math.abs(proc - ledger) <= TOLERANCE;

  // Bank statement is optional. With no bank amount yet, reconcile the processor
  // payout against the EfinMoney ledger; entering a bank amount later adds the
  // third-way check on top.
  if (bank == null) return ledgerMatches ? "matched" : "variance";

  const bankMatches = Math.abs(proc - bank) <= TOLERANCE;
  return ledgerMatches && bankMatches ? "matched" : "variance";
}

export const useReconciliations = () =>
  useQuery({
    queryKey: ["settlement-reconciliations"],
    queryFn: async (): Promise<ReconRow[]> => {
      const { data, error } = await (supabase as any)
        .from("settlement_reconciliations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as ReconRow[];
    },
    refetchInterval: 30_000,
  });

export interface ReconInput {
  processor: string;
  processor_settlement_amount: number;
  efinmoney_ledger_amount: number;
  bank_statement_amount?: number | null;
  batch_ref?: string | null;
  settlement_date?: string | null;
  notes?: string | null;
}

export const useCreateReconciliations = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: ReconInput[]) => {
      const payload = rows.map((r) => ({
        ...r,
        status: classifyRow({
          processor_settlement_amount: r.processor_settlement_amount,
          efinmoney_ledger_amount: r.efinmoney_ledger_amount,
          bank_statement_amount: r.bank_statement_amount ?? null,
        }),
      }));
      const { data, error } = await (supabase as any)
        .from("settlement_reconciliations")
        .insert(payload)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settlement-reconciliations"] }),
  });
};

export const useUpdateReconciliation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ReconRow>) => {
      const { error } = await (supabase as any)
        .from("settlement_reconciliations")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settlement-reconciliations"] }),
  });
};

export const useDeleteReconciliation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("settlement_reconciliations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settlement-reconciliations"] }),
  });
};

/** Re-classify every pending/missing/variance row and persist any status change. */
export const useRunMatching = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: ReconRow[]) => {
      const toUpdate = rows
        .map((r) => ({ row: r, next: classifyRow(r) }))
        .filter(({ row, next }) => row.status !== "duplicate" && next !== row.status);

      let updated = 0;
      const nowIso = new Date().toISOString();
      for (const { row, next } of toUpdate) {
        const { error } = await (supabase as any)
          .from("settlement_reconciliations")
          .update({ status: next, reconciled_at: nowIso })
          .eq("id", row.id);
        if (error) throw error;
        updated++;
      }
      return updated;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settlement-reconciliations"] }),
  });
};
