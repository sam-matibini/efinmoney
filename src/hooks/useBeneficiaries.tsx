import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type BeneficiaryCategory = "person" | "supplier" | "employee" | "contractor" | "payee" | "other";

export interface Beneficiary {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  country_code: string | null;
  payout_method: string | null;
  network: string | null;
  bank_name: string | null;
  bank_account: string | null;
  currency_code: string | null;
  nickname: string | null;
  avatar_initials: string | null;
  transfer_count: number;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
  // Payee directory extension
  category: BeneficiaryCategory;
  email: string | null;
  eft_institution: string | null;
  eft_transit: string | null;
  eft_account: string | null;
  eft_account_holder: string | null;
  interac_email: string | null;
  notes: string | null;
  tags: string[];
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";

export const useBeneficiaries = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["beneficiaries", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beneficiaries" as any)
        .select("*")
        .order("last_sent_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Beneficiary[];
    },
    enabled: !!user,
  });
};

export const useCreateBeneficiary = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<Beneficiary> & { name: string }) => {
      if (!user) throw new Error("Not authenticated");
      const payload = {
        user_id: user.id,
        name: input.name,
        phone: input.phone ?? null,
        country_code: input.country_code ?? null,
        payout_method: input.payout_method ?? null,
        network: input.network ?? null,
        bank_name: input.bank_name ?? null,
        bank_account: input.bank_account ?? null,
        currency_code: input.currency_code ?? null,
        nickname: input.nickname ?? null,
        avatar_initials: input.avatar_initials ?? initialsOf(input.name),
      };
      const { data, error } = await supabase
        .from("beneficiaries" as any)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Beneficiary;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["beneficiaries"] }),
  });
};

export const useUpdateBeneficiary = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Beneficiary> & { id: string }) => {
      const { data, error } = await supabase
        .from("beneficiaries" as any)
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Beneficiary;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["beneficiaries"] }),
  });
};

export const useDeleteBeneficiary = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("beneficiaries" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["beneficiaries"] }),
  });
};

/** Find an existing beneficiary by phone (or name) for the current user, or create one. */
export const recordTransferRecipient = async (params: {
  user_id: string;
  name: string;
  phone?: string | null;
  country_code?: string | null;
  payout_method?: string | null;
  network?: string | null;
  currency_code?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
}) => {
  const now = new Date().toISOString();
  // Try to find existing
  let query = supabase
    .from("beneficiaries" as any)
    .select("*")
    .eq("user_id", params.user_id)
    .limit(1);
  if (params.phone) {
    query = query.eq("phone", params.phone);
  } else {
    query = query.eq("name", params.name);
  }
  const { data: existing } = await query;
  const found = (existing || [])[0] as any;

  if (found) {
    // Backfill any payout details that weren't saved on the first transfer
    // so the contact pre-fills correctly next time.
    const patch: Record<string, any> = {
      transfer_count: (found.transfer_count || 0) + 1,
      last_sent_at: now,
    };
    if (!found.network && params.network) patch.network = params.network;
    if (!found.payout_method && params.payout_method) patch.payout_method = params.payout_method;
    if (!found.bank_name && params.bank_name) patch.bank_name = params.bank_name;
    if (!found.bank_account && params.bank_account) patch.bank_account = params.bank_account;
    if (!found.country_code && params.country_code) patch.country_code = params.country_code;
    await supabase.from("beneficiaries" as any).update(patch).eq("id", found.id);
    return { beneficiary: { ...found, ...patch } as Beneficiary, isNew: false };
  }
  return { beneficiary: null, isNew: true };
};
