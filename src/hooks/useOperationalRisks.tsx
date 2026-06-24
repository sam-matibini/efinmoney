import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OperationalRisk {
  id: string;
  title: string;
  category: string;
  likelihood: number;
  impact: number;
  risk_score: number;
  status: string;
  mitigation: string | null;
  owner: string | null;
  review_date: string | null;
  created_at: string;
  updated_at: string;
}

export const useOperationalRisks = () =>
  useQuery({
    queryKey: ["operational-risks"],
    queryFn: async (): Promise<OperationalRisk[]> => {
      const { data, error } = await supabase.from("operational_risks").select("*").order("risk_score", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

export const useCreateOperationalRisk = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { title: string; category: string; likelihood: number; impact: number; mitigation?: string }) => {
      const { data, error } = await supabase.from("operational_risks").insert(p).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operational-risks"] }),
  });
};

export const useUpdateOperationalRisk = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; status?: string; mitigation?: string }) => {
      const { error } = await supabase.from("operational_risks").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operational-risks"] }),
  });
};