import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type KycVerificationStatus =
  | "not_started"
  | "in_progress"
  | "pending_review"
  | "approved"
  | "rejected"
  | "expired";

export type KycCurrentStep = "identity" | "address" | "liveness" | "completed";

export interface KycRecord {
  id: string;
  user_id: string;
  verification_status: KycVerificationStatus;
  current_step: KycCurrentStep;
  id_document_type: string | null;
  id_document_url: string | null;
  id_document_country: string | null;
  id_verification_status: "pending" | "approved" | "rejected";
  id_rejection_reason: string | null;
  address_document_type: string | null;
  address_document_url: string | null;
  address_verification_status: "pending" | "approved" | "rejected";
  address_rejection_reason: string | null;
  selfie_url: string | null;
  liveness_check_status: "pending" | "approved" | "rejected";
  submitted_at: string | null;
  persona_inquiry_id: string | null;
  persona_inquiry_status: string | null;
  persona_decision: "approved" | "declined" | "needs_review" | null;
  persona_decision_reason: string | null;
}

export interface RiskTier {
  current_tier: "tier_1" | "tier_2" | "tier_3" | "tier_4";
  daily_transaction_limit: number;
  monthly_transaction_limit: number;
  single_transaction_limit: number;
  features_enabled: Record<string, boolean>;
}

export const useKyc = () => {
  const { user } = useAuth();

  const kycQ = useQuery({
    queryKey: ["kyc", user?.id],
    enabled: !!user,
    refetchInterval: (q) => {
      const d = q.state.data as KycRecord | null | undefined;
      if (!d) return false;
      return d.verification_status === "approved" || d.verification_status === "rejected"
        ? false
        : 2500;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kyc_verifications")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as KycRecord | null;
    },
  });

  const tierQ = useQuery({
    queryKey: ["risk-tier", user?.id],
    enabled: !!user,
    refetchInterval: (q) => {
      const d = q.state.data as RiskTier | null | undefined;
      if (!d) return 2500;
      return d.current_tier === "tier_1" ? 2500 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_risk_tiers")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as RiskTier | null;
    },
  });


  const isVerified =
    kycQ.data?.verification_status === "approved" &&
    (tierQ.data?.current_tier === "tier_2" ||
      tierQ.data?.current_tier === "tier_3" ||
      tierQ.data?.current_tier === "tier_4");

  return {
    kyc: kycQ.data ?? null,
    tier: tierQ.data ?? null,
    isLoading: kycQ.isLoading || tierQ.isLoading,
    isVerified,
    refetch: () => {
      kycQ.refetch();
      tierQ.refetch();
    },
  };
};
