import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type BamboraMethod = {
  id: string;
  user_id: string;
  customer_code: string;
  method_type: "card" | "bank";
  bambora_card_id: number | null;
  card_brand: string | null;
  last_four: string | null;
  exp_month: number | null;
  exp_year: number | null;
  cardholder_name: string | null;
  institution_number: string | null;
  branch_number: string | null;
  account_last_four: string | null;
  bank_account_holder: string | null;
  currency_code: string;
  is_default: boolean;
  created_at: string;
};

export function useBamboraMethods() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["bambora-methods", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<BamboraMethod[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("bambora_payment_methods" as never)
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) {
        if (error.code === "42501" || error.code === "PGRST301") {
          console.warn("bambora_payment_methods unavailable:", error.message);
          return [];
        }
        throw error;
      }
      return (data || []) as BamboraMethod[];
    },
  });
}

export function useDeleteBamboraMethod() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (methodId: string) => {
      const { data, error } = await supabase.functions.invoke("bambora-delete-method", {
        body: { methodId },
      });
      if (error || (data as { error?: string })?.error) {
        throw new Error((data as { error?: string })?.error || error?.message || "Delete failed");
      }
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["bambora-methods", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useChargeBamboraSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      methodId: string;
      amount: number;
      currency: string;
      walletId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("bambora-charge-saved", {
        body: input,
      });
      if (error || (data as { error?: string })?.error) {
        throw new Error((data as { error?: string })?.error || error?.message || "Charge failed");
      }
      return data as { amount: number; currency: string; transaction_id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallets"] });
    },
  });
}
