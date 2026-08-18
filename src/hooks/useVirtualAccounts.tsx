import { FunctionsHttpError } from "@supabase/supabase-js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface VirtualAccount {
  id: string;
  user_id: string;
  wallet_id: string | null;
  currency_code: string;
  account_number: string;
  bank_name: string;
  account_name: string;
  is_permanent: boolean;
  expires_at: string | null;
  status: "active" | "inactive" | "expired";
  created_at: string;
}

async function functionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      const message = body?.error ?? body?.message;
      if (typeof message === "string" && message.trim()) return message;
    } catch {
      /* non-JSON */
    }
    if (error.context.status === 404) {
      return "Bank account service is unavailable. Try again in a minute.";
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export const useVirtualAccounts = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["virtual_accounts", user?.id],
    queryFn: async (): Promise<VirtualAccount[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("virtual_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as VirtualAccount[];
    },
    enabled: !!user,
  });
};

export const useCreateVirtualAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (currency: string) => {
      const { data, error } = await supabase.functions.invoke("flw-create-virtual-account", {
        body: { currency, isPermanent: true },
      });
      if (error) throw new Error(await functionErrorMessage(error, "Could not create account"));
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["virtual_accounts"] }),
  });
};
