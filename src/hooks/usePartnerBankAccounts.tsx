import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PartnerBankAccount = {
  id: string;
  partner_id: string;
  label: string;
  purpose: string;
  account_holder: string | null;
  bank_name: string | null;
  account_number: string | null;
  routing_code: string | null;
  iban: string | null;
  swift_bic: string | null;
  currency_code: string | null;
  country: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const KEY = "partner_bank_accounts";

export const usePartnerBankAccounts = (partnerId?: string, enabled = true) =>
  useQuery({
    queryKey: [KEY, partnerId ?? "all"],
    enabled: enabled && !!partnerId,
    queryFn: async (): Promise<PartnerBankAccount[]> => {
      const { data, error } = await supabase
        .from("partner_bank_accounts")
        .select("*")
        .eq("partner_id", partnerId!)
        .order("is_primary", { ascending: false })
        .order("label");
      if (error) throw error;
      return (data || []) as PartnerBankAccount[];
    },
  });

export const useSavePartnerBankAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PartnerBankAccount>) => {
      const { id, created_at, updated_at, ...rest } = row as PartnerBankAccount;
      if (id) {
        const { error } = await supabase.from("partner_bank_accounts").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("partner_bank_accounts")
          .insert({ ...rest, created_by: auth.user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Banking details saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeletePartnerBankAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_bank_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Banking record removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Re-authenticate the signed-in admin with their own password before revealing banking data. */
export const useReauthenticate = () => {
  return useMutation({
    mutationFn: async (password: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const email = auth.user?.email;
      if (!email) throw new Error("No signed-in session");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Password incorrect");
      return true;
    },
  });
};
