import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as unknown as { from: (t: string) => any };

export interface PartnerContact {
  id: string;
  partner_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerAgreement {
  id: string;
  partner_id: string;
  type: string;
  status: string;
  title: string | null;
  file_path: string | null;
  signed_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/* ─── contacts ─── */

export const usePartnerContacts = (partnerId?: string) =>
  useQuery({
    queryKey: ["partner_contacts", partnerId ?? "all"],
    queryFn: async (): Promise<PartnerContact[]> => {
      let q = db.from("partner_contacts").select("*").order("is_primary", { ascending: false }).order("name");
      if (partnerId) q = q.eq("partner_id", partnerId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

export const useCreateContact = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PartnerContact>) => {
      const { error } = await db.from("partner_contacts").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_contacts"] });
      toast.success("Contact added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateContact = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PartnerContact> }) => {
      const { error } = await db.from("partner_contacts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_contacts"] });
      toast.success("Contact updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteContact = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("partner_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_contacts"] });
      toast.success("Contact removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/* ─── agreements ─── */

export const usePartnerAgreements = (partnerId?: string) =>
  useQuery({
    queryKey: ["partner_agreements", partnerId ?? "all"],
    queryFn: async (): Promise<PartnerAgreement[]> => {
      let q = db.from("partner_agreements").select("*").order("created_at", { ascending: false });
      if (partnerId) q = q.eq("partner_id", partnerId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

export const useCreateAgreement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PartnerAgreement>) => {
      const { error } = await db.from("partner_agreements").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_agreements"] });
      toast.success("Agreement saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateAgreement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PartnerAgreement> }) => {
      const { error } = await db.from("partner_agreements").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_agreements"] });
      toast.success("Agreement updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteAgreement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("partner_agreements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_agreements"] });
      toast.success("Agreement deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/* ─── file upload ─── */

export const uploadAgreementFile = async (file: File, partnerId: string): Promise<string> => {
  const ext = file.name.split(".").pop();
  const path = `${partnerId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("partner-agreements").upload(path, file);
  if (error) throw error;
  return path;
};

export const getAgreementFileUrl = (path: string) => {
  const { data } = supabase.storage.from("partner-agreements").getPublicUrl(path);
  return data.publicUrl;
};

export const getAgreementSignedUrl = async (path: string): Promise<string> => {
  const { data, error } = await supabase.storage
    .from("partner-agreements")
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
};
