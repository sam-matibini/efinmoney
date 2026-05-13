import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface SavedCard {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  card_brand: string | null;
  last_four: string | null;
  exp_month: number | null;
  exp_year: number | null;
  cardholder_name: string | null;
  is_default: boolean;
  currency_code: string | null;
  created_at: string;
}

export const useSavedCards = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["saved-cards", user?.id],
    queryFn: async (): Promise<SavedCard[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("saved_payment_methods")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as SavedCard[];
    },
    enabled: !!user,
  });
};

export const useDeleteSavedCard = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_payment_methods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Card removed");
      qc.invalidateQueries({ queryKey: ["saved-cards", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to remove card"),
  });
};

export const useSetDefaultSavedCard = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("saved_payment_methods")
        .update({ is_default: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-cards", user?.id] }),
    onError: (e: Error) => toast.error(e.message || "Failed to set default"),
  });
};
