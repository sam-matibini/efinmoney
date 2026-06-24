import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BeneficialOwner {
  id: string;
  customer_id: string;
  full_name: string;
  dob: string | null;
  nationality: string | null;
  ownership_pct: number;
  voting_pct: number;
  control_pct: number;
  pep_status: "none" | "domestic_pep" | "foreign_pep" | "hio" | "family_member" | "close_associate";
  sanctions_status: "not_screened" | "clear" | "hit" | "escalated";
  address: string | null;
  id_document_type: string | null;
  id_document_number: string | null;
  id_document_ref: string | null;
  verified_at: string | null;
  verified_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface UboComplianceEntry {
  customer_id: string;
  customer_name: string;
  risk_level: string;
  owners_25pct_plus: number;
  pep_owners: number;
  sanctions_hits: number;
  unverified_owners: number;
}

export const useBeneficialOwners = (customerId: string | undefined) =>
  useQuery({
    queryKey: ["beneficial-owners", customerId],
    enabled: !!customerId,
    queryFn: async (): Promise<BeneficialOwner[]> => {
      const { data, error } = await supabase
        .from("beneficial_owners")
        .select("*")
        .eq("customer_id", customerId)
        .order("ownership_pct", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

export const useUboComplianceView = () =>
  useQuery({
    queryKey: ["ubo-compliance-view"],
    queryFn: async (): Promise<UboComplianceEntry[]> => {
      const { data, error } = await supabase.from("ubo_compliance_view").select("*").order("customer_name");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60_000,
  });

export const useCreateBeneficialOwner = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<BeneficialOwner, "id" | "created_at" | "updated_at" | "verified_at" | "verified_by">) => {
      const { data, error } = await supabase.from("beneficial_owners").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["beneficial-owners", vars.customer_id] });
      qc.invalidateQueries({ queryKey: ["ubo-compliance-view"] });
    },
  });
};

export const useUpdateBeneficialOwner = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, customer_id, ...updates }: { id: string; customer_id: string; full_name?: string; ownership_pct?: number; voting_pct?: number; control_pct?: number; pep_status?: string; sanctions_status?: string; verified?: boolean; notes?: string }) => {
      const payload: Record<string, unknown> = { ...updates };
      if (updates.verified) {
        payload.verified_at = new Date().toISOString();
        payload.verified_by = (await supabase.auth.getUser()).data.user?.id;
      }
      const { data, error } = await supabase.from("beneficial_owners").update(payload).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["beneficial-owners", vars.customer_id] });
      qc.invalidateQueries({ queryKey: ["ubo-compliance-view"] });
    },
  });
};

export const useDeleteBeneficialOwner = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, customerId }: { id: string; customerId: string }) => {
      const { error } = await supabase.from("beneficial_owners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["beneficial-owners", vars.customerId] });
      qc.invalidateQueries({ queryKey: ["ubo-compliance-view"] });
    },
  });
};