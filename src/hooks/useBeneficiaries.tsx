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
  bank_code: string | null;
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
  address: string | null;
  tel: string | null;
  eft_institution: string | null;
  eft_transit: string | null;
  eft_account: string | null;
  eft_account_holder: string | null;
  interac_email: string | null;
  notes: string | null;
  tags: string[];
  mailing_address: string | null;
  mailing_city: string | null;
  mailing_region: string | null;
  mailing_postal_code: string | null;
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
      const payload: any = {
        user_id: user.id,
        name: input.name,
        phone: input.phone ?? null,
        country_code: input.country_code ?? null,
        payout_method: input.payout_method ?? null,
        network: input.network ?? null,
        bank_name: input.bank_name ?? null,
        bank_account: input.bank_account ?? null,
        bank_code: input.bank_code ?? null,
        currency_code: input.currency_code ?? null,
        nickname: input.nickname ?? null,
        avatar_initials: input.avatar_initials ?? initialsOf(input.name),
        category: input.category ?? "person",
        email: input.email ?? null,
        address: input.address ?? null,
        tel: input.tel ?? null,
        eft_institution: input.eft_institution ?? null,
        eft_transit: input.eft_transit ?? null,
        eft_account: input.eft_account ?? null,
        eft_account_holder: input.eft_account_holder ?? null,
        interac_email: input.interac_email ?? null,
        notes: input.notes ?? null,
        tags: input.tags ?? [],
        mailing_address: input.mailing_address ?? null,
        mailing_city: input.mailing_city ?? null,
        mailing_region: input.mailing_region ?? null,
        mailing_postal_code: input.mailing_postal_code ?? null,
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
export const isCanadaBeneficiary = (b: Beneficiary) =>
  b.country_code === "CAD"
  || !!b.eft_account
  || !!b.interac_email
  || b.payout_method === "eft"
  || b.payout_method === "interac";

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
  bank_code?: string | null;
  email?: string | null;
  address?: string | null;
  tel?: string | null;
  eft_institution?: string | null;
  eft_transit?: string | null;
  eft_account?: string | null;
  eft_account_holder?: string | null;
  interac_email?: string | null;
}) => {
  const now = new Date().toISOString();
  // Try to find existing
  let query = supabase
    .from("beneficiaries" as any)
    .select("*")
    .eq("user_id", params.user_id)
    .limit(1);
  if (params.interac_email) {
    query = query.eq("interac_email", params.interac_email);
  } else if (params.eft_account) {
    query = query.eq("eft_account", params.eft_account);
  } else if (params.phone) {
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
    if (!found.bank_code && params.bank_code) patch.bank_code = params.bank_code;
    if (!found.country_code && params.country_code) patch.country_code = params.country_code;
    if (!found.email && params.email) patch.email = params.email;
    if (!found.address && params.address) patch.address = params.address;
    if (!found.tel && params.tel) patch.tel = params.tel;
    if (!found.eft_institution && params.eft_institution) patch.eft_institution = params.eft_institution;
    if (!found.eft_transit && params.eft_transit) patch.eft_transit = params.eft_transit;
    if (!found.eft_account && params.eft_account) patch.eft_account = params.eft_account;
    if (!found.eft_account_holder && params.eft_account_holder) patch.eft_account_holder = params.eft_account_holder;
    if (!found.interac_email && params.interac_email) patch.interac_email = params.interac_email;
    await supabase.from("beneficiaries" as any).update(patch).eq("id", found.id);
    return { beneficiary: { ...found, ...patch } as Beneficiary, isNew: false };
  }

  // No match — create a row from whatever we have. Skip silent insert when
  // there's nothing useful to identify the recipient (no name, no phone/account).
  const trimmedName = (params.name || "").trim();
  if (!trimmedName && !params.phone && !params.eft_account && !params.interac_email) {
    return { beneficiary: null, isNew: false };
  }
  const insertPayload: Record<string, any> = {
    user_id: params.user_id,
    name: trimmedName || (params.phone ? `Contact ${params.phone}` : "Saved contact"),
    phone: params.phone ?? null,
    country_code: params.country_code ?? null,
    payout_method: params.payout_method ?? null,
    network: params.network ?? null,
    bank_name: params.bank_name ?? null,
    bank_account: params.bank_account ?? null,
    bank_code: params.bank_code ?? null,
    currency_code: params.currency_code ?? null,
    avatar_initials: initialsOf(trimmedName || params.phone || params.eft_account || params.interac_email || "C"),
    category: "person",
    email: params.email ?? null,
    address: params.address ?? null,
    tel: params.tel ?? null,
    eft_institution: params.eft_institution ?? null,
    eft_transit: params.eft_transit ?? null,
    eft_account: params.eft_account ?? null,
    eft_account_holder: params.eft_account_holder ?? null,
    interac_email: params.interac_email ?? null,
    transfer_count: 1,
    last_sent_at: now,
  };
  const { data: created, error } = await supabase
    .from("beneficiaries" as any)
    .insert(insertPayload)
    .select()
    .single();
  if (error) throw error;
  return { beneficiary: created as unknown as Beneficiary, isNew: true };
};
