import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (t: string) => any };

export interface PricingRule {
  id: string;
  name: string | null;
  source_currency: string;
  dest_country: string;
  dest_currency: string;
  payout_method: string;
  fee_percent: number;
  fee_fixed: number;
  fx_markup_percent: number;
  min_amount: number;
  max_amount: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type NewPricingRule = Omit<PricingRule, "id" | "created_at" | "updated_at">;

export const usePricingRules = () =>
  useQuery({
    queryKey: ["pricing_rules"],
    queryFn: async (): Promise<PricingRule[]> => {
      const { data, error } = await db.from("pricing_rules")
        .select("*")
        .order("source_currency")
        .order("dest_country");
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        fee_percent: Number(r.fee_percent),
        fee_fixed: Number(r.fee_fixed),
        fx_markup_percent: Number(r.fx_markup_percent),
        min_amount: Number(r.min_amount),
        max_amount: Number(r.max_amount),
      })) as PricingRule[];
    },
  });

export const useCreatePricingRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<NewPricingRule>) => {
      const { error } = await db.from("pricing_rules").insert(rule);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing_rules"] }),
  });
};

export const useUpdatePricingRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PricingRule> }) => {
      const { error } = await db.from("pricing_rules").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing_rules"] }),
  });
};

export const useDeletePricingRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("pricing_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing_rules"] }),
  });
};
