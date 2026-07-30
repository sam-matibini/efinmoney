import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const rpc = supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => any };

export type ProfitGroupBy = "partner" | "corridor" | "currency" | "method";

export interface ProfitRow {
  group_key: string;
  group_label: string;
  txn_count: number;
  volume: number;
  revenue: number;
  cost: number;
  profit: number;
  margin_percent: number;
  pricing_gaps: number;
}

export interface VarianceRow {
  transfer_id: string;
  created_at: string;
  corridor: string;
  amount: number;
  expected_partner: string | null;
  actual_partner: string | null;
  expected_profit: number;
  actual_profit: number;
  variance: number;
}

export interface PricingGapRow {
  partner_code: string;
  partner_name: string;
  source_currency: string;
  dest_currency: string;
  dest_country: string | null;
  payment_method: string | null;
  txn_count: number;
  volume: number;
}

const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const num = <T,>(row: T, keys: string[]): T => {
  const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const k of keys) out[k] = Number(out[k] ?? 0);
  return out as T;
};

export const useProfitabilitySummary = (days: number, groupBy: ProfitGroupBy) =>
  useQuery({
    queryKey: ["profitability_summary", days, groupBy],
    queryFn: async (): Promise<ProfitRow[]> => {
      const { data, error } = await rpc.rpc("profitability_summary", {
        p_from: since(days),
        p_to: new Date().toISOString(),
        p_group_by: groupBy,
      });
      if (error) throw error;
      return (data || []).map((r: ProfitRow) =>
        num(r, ["txn_count", "volume", "revenue", "cost", "profit", "margin_percent", "pricing_gaps"]),
      );
    },
  });

export const useRoutingVariance = (days: number, limit = 25) =>
  useQuery({
    queryKey: ["routing_profit_variance", days, limit],
    queryFn: async (): Promise<VarianceRow[]> => {
      const { data, error } = await rpc.rpc("routing_profit_variance", {
        p_from: since(days),
        p_to: new Date().toISOString(),
        p_limit: limit,
      });
      if (error) throw error;
      return (data || []).map((r: VarianceRow) =>
        num(r, ["amount", "expected_profit", "actual_profit", "variance"]),
      );
    },
  });

export const usePricingGaps = (days: number) =>
  useQuery({
    queryKey: ["pricing_coverage_gaps", days],
    queryFn: async (): Promise<PricingGapRow[]> => {
      const { data, error } = await rpc.rpc("pricing_coverage_gaps", {
        p_from: since(days),
        p_to: new Date().toISOString(),
      });
      if (error) throw error;
      return (data || []).map((r: PricingGapRow) => num(r, ["txn_count", "volume"]));
    },
  });
