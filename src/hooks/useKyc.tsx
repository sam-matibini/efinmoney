import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type PersonaVerificationData = {
  data?: {
    attributes?: {
      completedAt?: string | null;
    };
    relationships?: {
      verifications?: {
        data?: Array<{ type?: string | null }>;
      };
    };
  };
  included?: Array<{
    type?: string | null;
    attributes?: {
      status?: string | null;
      checks?: Array<{ status?: string | null }>;
    };
  }>;
};

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
  persona_verification_data?: PersonaVerificationData | null;
}

export interface RiskTier {
  current_tier: "tier_1" | "tier_2" | "tier_3";
  daily_transaction_limit: number;
  monthly_transaction_limit: number;
  single_transaction_limit: number;
  features_enabled: Record<string, boolean>;
}

const hasPassedCoreChecks = (kyc: KycRecord | null | undefined) => {
  if (!kyc) return false;

  const personaData = kyc.persona_verification_data;
  const personaCompleted = Boolean(personaData?.data?.attributes?.completedAt);
  const hasSelfieVerification = Boolean(
    personaData?.data?.relationships?.verifications?.data?.some(
      (verification) => verification?.type === "verification/selfie"
    )
  );
  const selfieVerificationPassed = Boolean(
    personaData?.included?.some(
      (item) =>
        item?.type === "verification/selfie" &&
        (item.attributes?.status === "passed" ||
          item.attributes?.status === "completed" ||
          item.attributes?.checks?.some((check) => check.status === "passed"))
    )
  );

  const idPassed = kyc.id_verification_status === "approved";
  const facePassed =
    kyc.liveness_check_status === "approved" ||
    kyc.persona_decision === "approved" ||
    (Boolean(kyc.selfie_url) && personaCompleted && (hasSelfieVerification || selfieVerificationPassed));

  return idPassed && facePassed;
};

export const useKyc = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const kycQ = useQuery({
    queryKey: ["kyc", user?.id],
    enabled: !!user,
    refetchInterval: (q) => {
      const d = q.state.data as KycRecord | null | undefined;
      if (!d) return false;
      if (d.verification_status === "approved" || d.verification_status === "rejected") return false;
      return d.persona_inquiry_id ? 1000 : 2500;
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
      if (!d) return 1000;
      return d.current_tier === "tier_3" ? false : 1000;
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

  const corePassed = hasPassedCoreChecks(kycQ.data);
  const isVerified =
    kycQ.data?.verification_status === "approved" || corePassed;

  // Tier upgrades and profile sync are handled server-side by the
  // on_kyc_status_change trigger once a reviewer (or auto-approval flow)
  // sets verification_status='approved'. Client-side writes here would be
  // a privilege escalation vector and are intentionally omitted.


  return {
    kyc: kycQ.data ?? null,
    tier: tierQ.data ?? null,
    isLoading: kycQ.isLoading || tierQ.isLoading,
    isVerified,
    hasPassedCoreChecks: corePassed,
    refetch: async () => {
      const [kycResult, tierResult] = await Promise.all([kycQ.refetch(), tierQ.refetch()]);
      const nextKyc = (kycResult.data ?? null) as KycRecord | null;
      const nextTier = (tierResult.data ?? null) as RiskTier | null;
      const nextCorePassed = hasPassedCoreChecks(nextKyc);

      return {
        kyc: nextKyc,
        tier: nextTier,
        hasPassedCoreChecks: nextCorePassed,
        isVerified: nextKyc?.verification_status === "approved" || nextCorePassed,
      };
    },
  };
};
