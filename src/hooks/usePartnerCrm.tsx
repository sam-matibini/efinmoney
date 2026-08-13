import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storageKey";
import { toast } from "sonner";

export const PARTNER_DOC_BUCKET = "partner-documents";

export type PartnerContact = {
  id: string;
  partner_id: string;
  full_name: string;
  title: string | null;
  role_type: string;
  email: string | null;
  phone: string | null;
  phone_alt: string | null;
  timezone: string | null;
  preferred_channel: string | null;
  is_primary: boolean;
  escalation_order: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerAddress = {
  id: string;
  partner_id: string;
  address_type: string;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerDocument = {
  id: string;
  partner_id: string;
  doc_type: string;
  title: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  version: string | null;
  status: string;
  signed_date: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  counterparty_signer: string | null;
  superseded_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerCrmActivity = {
  id: string;
  partner_id: string;
  activity_type: string;
  subject: string;
  body: string | null;
  occurred_at: string;
  contact_id: string | null;
  document_id: string | null;
  follow_up_at: string | null;
  follow_up_owner: string | null;
  follow_up_done: boolean;
  created_at: string;
  updated_at: string;
};

export const CONTACT_ROLES = [
  "commercial",
  "integration",
  "support",
  "compliance",
  "finance",
  "executive",
] as const;

export const ADDRESS_TYPES = ["registered", "operations", "billing", "mailing"] as const;

export const DOC_TYPES = [
  "agreement",
  "pricing_schedule",
  "amendment",
  "nda",
  "sla",
  "compliance_questionnaire",
  "licence",
  "insurance",
  "tax_form",
  "kyb_pack",
  "other",
] as const;

export const DOC_STATUSES = ["draft", "under_review", "executed", "expired", "superseded"] as const;

export const ACTIVITY_TYPES = [
  "call",
  "email",
  "meeting",
  "negotiation",
  "escalation",
  "review",
  "note",
] as const;

export const prettyLabel = (v?: string | null) =>
  !v ? "—" : v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const strip = (row: Record<string, unknown>) => {
  const { id, ...rest } = row;
  delete rest.created_at;
  delete rest.updated_at;
  return { id: id as string | undefined, rest };
};

/* ---------------------------------------------- contacts */

export const usePartnerContacts = (partnerId?: string) =>
  useQuery({
    queryKey: ["partner_contacts", partnerId ?? "all"],
    queryFn: async (): Promise<PartnerContact[]> => {
      let q = supabase.from("partner_contacts").select("*");
      if (partnerId) q = q.eq("partner_id", partnerId);
      const { data, error } = await q
        .order("is_primary", { ascending: false })
        .order("escalation_order", { ascending: true, nullsFirst: false })
        .order("full_name");
      if (error) throw error;
      return (data || []) as PartnerContact[];
    },
  });

export const useSavePartnerContact = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PartnerContact>) => {
      const { id, rest } = strip(row as unknown as Record<string, unknown>);
      if (id) {
        const { error } = await supabase.from("partner_contacts").update(rest as never).eq("id", id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("partner_contacts")
          .insert(({ ...rest, created_by: auth.user?.id ?? null } as never));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_contacts"] });
      toast.success("Contact saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeletePartnerContact = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_contacts"] });
      toast.success("Contact removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/* ---------------------------------------------- addresses */

export const usePartnerAddresses = (partnerId?: string) =>
  useQuery({
    queryKey: ["partner_addresses", partnerId ?? "all"],
    queryFn: async (): Promise<PartnerAddress[]> => {
      let q = supabase.from("partner_addresses").select("*");
      if (partnerId) q = q.eq("partner_id", partnerId);
      const { data, error } = await q.order("address_type");
      if (error) throw error;
      return (data || []) as PartnerAddress[];
    },
  });

export const useSavePartnerAddress = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PartnerAddress>) => {
      const { id, rest } = strip(row as unknown as Record<string, unknown>);
      if (id) {
        const { error } = await supabase.from("partner_addresses").update(rest as never).eq("id", id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("partner_addresses")
          .insert(({ ...rest, created_by: auth.user?.id ?? null } as never));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_addresses"] });
      toast.success("Address saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeletePartnerAddress = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_addresses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_addresses"] });
      toast.success("Address removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/* ---------------------------------------------- documents */

export const usePartnerDocuments = (partnerId?: string) =>
  useQuery({
    queryKey: ["partner_documents", partnerId ?? "all"],
    queryFn: async (): Promise<PartnerDocument[]> => {
      let q = supabase.from("partner_documents").select("*");
      if (partnerId) q = q.eq("partner_id", partnerId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PartnerDocument[];
    },
  });

export interface UploadDocInput {
  partner_id: string;
  file: File;
  meta: Partial<PartnerDocument>;
  /** When set, the previous document is marked superseded by the new one. */
  supersedes?: string;
}

export const useUploadPartnerDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ partner_id, file, meta, supersedes }: UploadDocInput) => {
      const path = `${partner_id}/${crypto.randomUUID()}-${sanitizeStorageFilename(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(PARTNER_DOC_BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) throw upErr;

      const { data: auth } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase
        .from("partner_documents")
        .insert({
          partner_id,
          title: meta.title || file.name,
          doc_type: meta.doc_type || "agreement",
          status: meta.status || "executed",
          version: meta.version || null,
          signed_date: meta.signed_date || null,
          effective_date: meta.effective_date || null,
          expiry_date: meta.expiry_date || null,
          counterparty_signer: meta.counterparty_signer || null,
          notes: meta.notes || null,
          file_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
          uploaded_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (supersedes && inserted?.id) {
        await supabase
          .from("partner_documents")
          .update({ status: "superseded", superseded_by: inserted.id })
          .eq("id", supersedes);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_documents"] });
      toast.success("Document uploaded");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useSavePartnerDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PartnerDocument>) => {
      const { id, rest } = strip(row as unknown as Record<string, unknown>);
      if (!id) throw new Error("Missing document id");
      delete rest.file_path;
      delete rest.file_name;
      const { error } = await supabase.from("partner_documents").update(rest as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_documents"] });
      toast.success("Document updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeletePartnerDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: PartnerDocument) => {
      await supabase.storage.from(PARTNER_DOC_BUCKET).remove([doc.file_path]).catch(() => undefined);
      const { error } = await supabase.from("partner_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_documents"] });
      toast.success("Document removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

/** Short-lived signed link for a stored agreement. */
export async function partnerDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(PARTNER_DOC_BUCKET).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not create download link");
  return data.signedUrl;
}

export const docExpiryState = (expiry: string | null): "none" | "ok" | "soon" | "expired" => {
  if (!expiry) return "none";
  const days = (new Date(expiry).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "expired";
  if (days <= 60) return "soon";
  return "ok";
};

/* ---------------------------------------------- CRM activity */

export const usePartnerCrmActivities = (partnerId?: string) =>
  useQuery({
    queryKey: ["partner_crm_activities", partnerId ?? "all"],
    queryFn: async (): Promise<PartnerCrmActivity[]> => {
      let q = supabase.from("partner_crm_activities").select("*");
      if (partnerId) q = q.eq("partner_id", partnerId);
      const { data, error } = await q.order("occurred_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data || []) as PartnerCrmActivity[];
    },
  });

export const useSavePartnerCrmActivity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<PartnerCrmActivity>) => {
      const { id, rest } = strip(row as unknown as Record<string, unknown>);
      if (id) {
        const { error } = await supabase.from("partner_crm_activities").update(rest as never).eq("id", id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("partner_crm_activities")
          .insert(({ ...rest, created_by: auth.user?.id ?? null } as never));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_crm_activities"] });
      toast.success("Activity logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeletePartnerCrmActivity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_crm_activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_crm_activities"] });
      toast.success("Activity removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
