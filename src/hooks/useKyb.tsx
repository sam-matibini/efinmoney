import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// business_* tables are newer than the generated types.ts (same pattern as
// usePricingRules).
const db = supabase as unknown as { from: (t: string) => any };

export const UBO_THRESHOLD_PERCENT = 25;

export type KybStatus =
  | "not_started"
  | "in_progress"
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";

export type KybStep = "details" | "ownership" | "documents" | "review" | "completed";
export type KybTier = "kyb_0" | "kyb_1" | "kyb_2";
export type KybDocStatus = "pending" | "approved" | "rejected";

export type BusinessEntityType =
  | "sole_proprietorship"
  | "partnership"
  | "corporation"
  | "llc"
  | "ngo"
  | "cooperative"
  | "trust"
  | "other";

export type BusinessOwnerRole =
  | "beneficial_owner"
  | "director"
  | "signing_officer"
  | "senior_officer";

export interface BusinessProfile {
  id: string;
  owner_user_id: string;
  legal_name: string;
  operating_name: string | null;
  entity_type: BusinessEntityType;
  registration_number: string | null;
  tax_id: string | null;
  date_of_incorporation: string | null;
  incorporation_country: string;
  incorporation_region: string | null;
  industry: string | null;
  naics_code: string | null;
  website: string | null;
  business_phone: string | null;
  business_email: string | null;
  expected_monthly_volume: number | null;
  source_of_funds: string | null;
  street_address: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  address_country: string | null;
  op_street_address: string | null;
  op_city: string | null;
  op_state_province: string | null;
  op_postal_code: string | null;
  op_address_country: string | null;
  kyb_status: KybStatus;
  current_step: KybStep;
  kyb_tier: KybTier;
  risk_level: "low" | "medium" | "high";
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessOwner {
  id: string;
  business_profile_id: string;
  full_name: string;
  date_of_birth: string | null;
  role: BusinessOwnerRole;
  ownership_percent: number;
  nationality: string | null;
  occupation: string | null;
  is_pep: boolean;
  street_address: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  address_country: string | null;
  email: string | null;
  phone: string | null;
  verification_status: KybDocStatus;
  rejection_reason: string | null;
}

export interface BusinessDocument {
  id: string;
  business_profile_id: string;
  business_owner_id: string | null;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  status: KybDocStatus;
  rejection_reason: string | null;
  uploaded_at: string;
}

export interface KybDocumentRequirement {
  id: string;
  country: string;
  entity_type: BusinessEntityType | null;
  document_type: string;
  label: string;
  description: string | null;
  is_required: boolean;
  applies_to: "business" | "owner";
  sort_order: number;
}

export interface BusinessTierLimits {
  tier: KybTier;
  label: string;
  max_balance: number;
  daily_limit: number;
  monthly_limit: number;
  single_limit: number;
  features_enabled: Record<string, boolean>;
}

const BUCKET = "business-documents";

export const useKyb = () => {
  const { user } = useAuth();
  const qc = useQueryClient();

  const businessQ = useQuery({
    queryKey: ["kyb", "business", user?.id],
    enabled: !!user,
    refetchInterval: (q) => {
      const d = q.state.data as BusinessProfile | null | undefined;
      if (!d) return false;
      // Poll only while a reviewer might be acting on it.
      return d.kyb_status === "pending_review" ? 5000 : false;
    },
    queryFn: async (): Promise<BusinessProfile | null> => {
      const { data, error } = await db
        .from("business_profiles")
        .select("*")
        .eq("owner_user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        expected_monthly_volume:
          data.expected_monthly_volume === null ? null : Number(data.expected_monthly_volume),
      } as BusinessProfile;
    },
  });

  const businessId = businessQ.data?.id ?? null;

  const ownersQ = useQuery({
    queryKey: ["kyb", "owners", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<BusinessOwner[]> => {
      const { data, error } = await db
        .from("business_owners")
        .select("*")
        .eq("business_profile_id", businessId)
        .order("ownership_percent", { ascending: false });
      if (error) throw error;
      return (data || []).map((o: any) => ({
        ...o,
        ownership_percent: Number(o.ownership_percent),
      })) as BusinessOwner[];
    },
  });

  const documentsQ = useQuery({
    queryKey: ["kyb", "documents", businessId],
    enabled: !!businessId,
    queryFn: async (): Promise<BusinessDocument[]> => {
      const { data, error } = await db
        .from("business_documents")
        .select("*")
        .eq("business_profile_id", businessId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data || []) as BusinessDocument[];
    },
  });

  const country = businessQ.data?.incorporation_country ?? null;
  const entityType = businessQ.data?.entity_type ?? null;

  const requirementsQ = useQuery({
    queryKey: ["kyb", "requirements", country, entityType],
    enabled: !!country,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<KybDocumentRequirement[]> => {
      const { data, error } = await db
        .from("kyb_document_requirements")
        .select("*")
        .eq("country", country)
        .eq("enabled", true)
        .order("applies_to")
        .order("sort_order");
      if (error) throw error;
      // entity_type NULL means "applies to every entity type".
      return (data || []).filter(
        (r: any) => r.entity_type === null || r.entity_type === entityType
      ) as KybDocumentRequirement[];
    },
  });

  const limitsQ = useQuery({
    queryKey: ["kyb", "limits", businessQ.data?.kyb_tier],
    enabled: !!businessQ.data,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<BusinessTierLimits | null> => {
      const { data, error } = await db
        .from("business_tier_limits")
        .select("*")
        .eq("tier", businessQ.data!.kyb_tier)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        max_balance: Number(data.max_balance),
        daily_limit: Number(data.daily_limit),
        monthly_limit: Number(data.monthly_limit),
        single_limit: Number(data.single_limit),
      } as BusinessTierLimits;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["kyb"] });
  };

  const saveBusiness = useMutation({
    mutationFn: async (patch: Partial<BusinessProfile>) => {
      if (businessId) {
        const { data, error } = await db
          .from("business_profiles")
          .update(patch)
          .eq("id", businessId)
          .select()
          .single();
        if (error) throw error;
        return data as BusinessProfile;
      }
      const { data, error } = await db
        .from("business_profiles")
        .insert({ ...patch, owner_user_id: user!.id, kyb_status: "in_progress" })
        .select()
        .single();
      if (error) throw error;
      return data as BusinessProfile;
    },
    onSuccess: invalidate,
  });

  const saveOwner = useMutation({
    mutationFn: async (owner: Partial<BusinessOwner> & { id?: string }) => {
      if (owner.id) {
        const { id, ...patch } = owner;
        const { error } = await db.from("business_owners").update(patch).eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await db
        .from("business_owners")
        .insert({ ...owner, business_profile_id: businessId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeOwner = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("business_owners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const uploadDocument = useMutation({
    mutationFn: async ({
      file,
      documentType,
      ownerId,
    }: {
      file: File;
      documentType: string;
      ownerId?: string;
    }) => {
      if (!businessId) throw new Error("Create the business profile first.");
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      // Path must start with the uploader's uid — the storage policy checks it.
      const path = `${user!.id}/${businessId}/${documentType}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { error } = await db.from("business_documents").insert({
        business_profile_id: businessId,
        business_owner_id: ownerId ?? null,
        document_type: documentType,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeDocument = useMutation({
    mutationFn: async (doc: BusinessDocument) => {
      const { error } = await db.from("business_documents").delete().eq("id", doc.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([doc.file_path]);
    },
    onSuccess: invalidate,
  });

  const submitForReview = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("Nothing to submit.");
      const { error } = await db
        .from("business_profiles")
        .update({ kyb_status: "pending_review", current_step: "review" })
        .eq("id", businessId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const owners = ownersQ.data ?? [];
  const documents = documentsQ.data ?? [];
  const requirements = requirementsQ.data ?? [];

  const ownershipTotal = useMemo(
    () =>
      owners
        .filter((o) => o.role === "beneficial_owner")
        .reduce((sum, o) => sum + (o.ownership_percent || 0), 0),
    [owners]
  );

  // A doc counts as supplied unless it was rejected — a pending upload is enough
  // to submit; the reviewer decides from there.
  const suppliedBusinessTypes = useMemo(
    () =>
      new Set(
        documents
          .filter((d) => d.status !== "rejected" && d.business_owner_id === null)
          .map((d) => d.document_type)
      ),
    [documents]
  );

  const missingRequiredDocs = useMemo(
    () =>
      requirements.filter(
        (r) =>
          r.is_required && r.applies_to === "business" && !suppliedBusinessTypes.has(r.document_type)
      ),
    [requirements, suppliedBusinessTypes]
  );

  // Owner docs are keyed per person, so a "supplied" set is scoped by owner id.
  const missingOwnerDocs = useMemo(() => {
    const supplied = new Set(
      documents
        .filter((d) => d.status !== "rejected" && d.business_owner_id)
        .map((d) => `${d.business_owner_id}:${d.document_type}`)
    );
    const ownerReqs = requirements.filter((r) => r.is_required && r.applies_to === "owner");
    return owners.flatMap((o) =>
      ownerReqs
        .filter((r) => !supplied.has(`${o.id}:${r.document_type}`))
        .map((r) => ({
          ownerId: o.id,
          ownerName: o.full_name,
          documentType: r.document_type,
          label: r.label,
        }))
    );
  }, [documents, requirements, owners]);

  const business = businessQ.data ?? null;

  const hasDeclaredOwners = owners.some((o) => o.role === "beneficial_owner");
  const ownershipValid = ownershipTotal <= 100;

  const canSubmit =
    !!business &&
    ["in_progress", "rejected"].includes(business.kyb_status) &&
    hasDeclaredOwners &&
    ownershipValid &&
    missingRequiredDocs.length === 0 &&
    missingOwnerDocs.length === 0;

  return {
    business,
    owners,
    documents,
    requirements,
    limits: limitsQ.data ?? null,

    isLoading: businessQ.isLoading || (!!businessId && (ownersQ.isLoading || documentsQ.isLoading)),

    isApproved: business?.kyb_status === "approved",
    isPendingReview: business?.kyb_status === "pending_review",
    isRejected: business?.kyb_status === "rejected",

    ownershipTotal,
    ownershipValid,
    hasDeclaredOwners,
    missingRequiredDocs,
    missingOwnerDocs,
    canSubmit,

    saveBusiness,
    saveOwner,
    removeOwner,
    uploadDocument,
    removeDocument,
    submitForReview,
    refetch: () => qc.invalidateQueries({ queryKey: ["kyb"] }),
  };
};
