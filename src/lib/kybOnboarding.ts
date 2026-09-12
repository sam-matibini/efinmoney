import type { BusinessProfile, KybDocumentRequirement, KybStep } from "@/hooks/useKyb";

export function isBusinessPrimaryAccount(
  user: { user_metadata?: Record<string, unknown> } | null | undefined,
  business?: { id?: string } | null,
): boolean {
  const at = user?.user_metadata?.account_type;
  if (at === "business") return true;
  if (at === "individual") return false;
  return Boolean(business?.id);
}

const STEP_PATH: Record<KybStep, string> = {
  details: "/onboarding/business/details",
  ownership: "/onboarding/business/ownership",
  documents: "/onboarding/business/documents",
  review: "/onboarding/business/review",
  completed: "/onboarding/business/details",
};

export function kybResumePath(
  business: Pick<BusinessProfile, "kyb_status" | "current_step"> | null | undefined,
): string {
  if (!business) return "/onboarding/business/details";
  switch (business.kyb_status) {
    case "pending_review":
      return "/onboarding/business/submitted";
    case "approved":
      return "/business";
    case "rejected":
    case "suspended":
      return "/onboarding/business/rejected";
    default:
      return STEP_PATH[business.current_step] ?? "/onboarding/business/details";
  }
}

export type KybWizardPage =
  | "details"
  | "ownership"
  | "documents"
  | "review"
  | "submitted"
  | "rejected";

/** Where a KYB wizard page should send the applicant instead of rendering. */
export function kybPageOverridePath(
  business: Pick<BusinessProfile, "kyb_status"> | null | undefined,
  page: KybWizardPage,
): string | null {
  if (!business && page !== "details") return "/onboarding/business/details";
  if (!business) return null;
  if (business.kyb_status === "pending_review" && page !== "submitted") {
    return "/onboarding/business/submitted";
  }
  if (business.kyb_status === "approved") {
    return "/business";
  }
  if (
    (business.kyb_status === "rejected" || business.kyb_status === "suspended") &&
    page !== "rejected"
  ) {
    return "/onboarding/business/rejected";
  }
  return null;
}

/** Used when the jurisdiction has no seeded document matrix (CA / NG are seeded). */
export const GENERIC_KYB_REQUIREMENTS: KybDocumentRequirement[] = [
  {
    id: "generic-registration",
    country: "*",
    entity_type: null,
    document_type: "registration_certificate",
    label: "Certificate of incorporation / registration",
    description: "Official registry document showing the legal name and number.",
    is_required: true,
    applies_to: "business",
    sort_order: 10,
  },
  {
    id: "generic-address",
    country: "*",
    entity_type: null,
    document_type: "proof_of_business_address",
    label: "Proof of business address",
    description: "Utility bill, lease, or bank statement dated within 90 days.",
    is_required: true,
    applies_to: "business",
    sort_order: 20,
  },
  {
    id: "generic-ownership",
    country: "*",
    entity_type: null,
    document_type: "ownership_chart",
    label: "Ownership / control structure",
    description: "Shows every individual who owns 25% or more.",
    is_required: true,
    applies_to: "business",
    sort_order: 30,
  },
  {
    id: "generic-owner-id",
    country: "*",
    entity_type: null,
    document_type: "owner_government_id",
    label: "Government-issued photo ID",
    description: "Passport, driver's licence, or national ID for each owner and director.",
    is_required: true,
    applies_to: "owner",
    sort_order: 10,
  },
  {
    id: "generic-owner-address",
    country: "*",
    entity_type: null,
    document_type: "owner_proof_of_address",
    label: "Proof of personal address",
    description: "Dated within 90 days.",
    is_required: true,
    applies_to: "owner",
    sort_order: 20,
  },
  {
    id: "generic-owner-selfie",
    country: "*",
    entity_type: null,
    document_type: "owner_selfie",
    label: "Selfie / liveness check",
    description: "A live photo of the individual's face, taken with your camera.",
    is_required: true,
    applies_to: "owner",
    sort_order: 30,
  },
];
