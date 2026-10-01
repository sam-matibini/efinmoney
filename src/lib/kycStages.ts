export type KycStageStatus = "complete" | "pending" | "available" | "locked";

export type KycStageInput = {
  verification_status?: string | null;
  tier_target?: string | null;
  id_verification_status?: string | null;
  liveness_check_status?: string | null;
  address_document_url?: string | null;
  address_verification_status?: string | null;
  source_of_funds_url?: string | null;
  source_of_funds_status?: string | null;
} | null;

export type KycStage = {
  id: string;
  tier: 2 | 3;
  title: string;
  description: string;
  status: KycStageStatus;
  href: string | null;
};

const UPGRADE = "upgrade=1";

/** Personal tier upgrades stay on KYC even when the account is also a business. */
export function skipBusinessKycRedirect(upgradeParam: string | null | undefined): boolean {
  return upgradeParam === "1";
}

export function kycTierNumber(value: string | null | undefined): number {
  const match = String(value ?? "").match(/(\d+)/);
  const tier = match ? Number(match[1]) : 0;
  return tier >= 0 && tier <= 3 ? tier : 0;
}

export function buildKycStages(tierNumber: number, kyc: KycStageInput): KycStage[] {
  const tier2Done = tierNumber >= 2;
  const tier3Done = tierNumber >= 3;
  const reviewingTier3 =
    !tier3Done &&
    kyc?.verification_status === "pending_review" &&
    (kyc.tier_target === "tier_3" || Boolean(kyc.source_of_funds_url || kyc.address_document_url));
  const reviewingTier2 =
    !tier2Done && kyc?.verification_status === "pending_review" && !reviewingTier3;

  const identityDone = tier2Done || kyc?.id_verification_status === "approved";
  const selfieDone = tier2Done || kyc?.liveness_check_status === "approved";
  const addressDone = tier3Done || kyc?.address_verification_status === "approved";
  const sourceDone = tier3Done || kyc?.source_of_funds_status === "approved";

  const tier2Status = (done: boolean): KycStageStatus =>
    done ? "complete" : reviewingTier2 ? "pending" : "available";
  const tier3Status = (done: boolean, uploaded: boolean): KycStageStatus => {
    if (done) return "complete";
    if (tierNumber < 2) return "locked";
    if (reviewingTier3 && uploaded) return "pending";
    return "available";
  };

  return [
    {
      id: "identity",
      tier: 2,
      title: "Government ID",
      description: "Passport, driver's licence, or national ID for Tier 2.",
      status: tier2Status(identityDone),
      href: `/onboarding/identity?${UPGRADE}&stage=identity`,
    },
    {
      id: "selfie",
      tier: 2,
      title: "Live selfie",
      description: "Match a live photo to the ID for Tier 2.",
      status: tier2Status(selfieDone),
      href: `/onboarding/identity?${UPGRADE}&stage=selfie`,
    },
    {
      id: "address",
      tier: 3,
      title: "Proof of address",
      description: "Utility bill, bank statement, or government letter for Tier 3.",
      status: tier3Status(addressDone, Boolean(kyc?.address_document_url)),
      href: tierNumber < 2 ? null : `/onboarding/enhanced?${UPGRADE}&stage=address`,
    },
    {
      id: "source",
      tier: 3,
      title: "Source of funds",
      description: "Show where the funds come from to finish Tier 3.",
      status: tier3Status(sourceDone, Boolean(kyc?.source_of_funds_url)),
      href: tierNumber < 2 ? null : `/onboarding/enhanced?${UPGRADE}&stage=source`,
    },
  ];
}

export function remainingKycStages(stages: KycStage[]): KycStage[] {
  return stages.filter((stage) => stage.status !== "complete");
}
