export type KycVerificationProvider = "plaid" | "persona" | "interac" | "manual" | string | null | undefined;

const LABELS: Record<string, string> = {
  plaid: "Plaid",
  persona: "Persona",
  interac: "Interac",
  manual: "Manual",
};

export function inferKycProvider(input: {
  verification_provider?: string | null;
  persona_inquiry_id?: string | null;
  persona_decision?: string | null;
  plaid_identity_verification_id?: string | null;
}): string | null {
  const raw = (input.verification_provider || "").trim().toLowerCase();
  if (raw) return raw;
  if (input.plaid_identity_verification_id) return "plaid";
  if (input.persona_inquiry_id || input.persona_decision) return "persona";
  return null;
}

export function kycProviderLabel(
  provider: KycVerificationProvider,
  extras?: {
    persona_inquiry_id?: string | null;
    persona_decision?: string | null;
    plaid_identity_verification_id?: string | null;
  },
): string {
  const key = inferKycProvider({
    verification_provider: provider ?? null,
    persona_inquiry_id: extras?.persona_inquiry_id,
    persona_decision: extras?.persona_decision,
    plaid_identity_verification_id: extras?.plaid_identity_verification_id,
  });
  if (!key) return "—";
  return LABELS[key] || key.replace(/_/g, " ");
}
