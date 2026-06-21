type BillingProfile = {
  full_name?: string | null;
  street_address?: string | null;
  city?: string | null;
  postal_code?: string | null;
};

export type CardIssueRedirect = "profile" | "kyc";

export const PROFILE_BILLING_ERROR =
  "Missing profile data. Please complete your full name and billing address (street, city, postal code) in Profile Settings.";

export function getProfileBillingGap(profile: BillingProfile | null | undefined): string | null {
  if (!profile?.full_name?.trim()) return PROFILE_BILLING_ERROR;
  if (!profile.street_address?.trim() || !profile.city?.trim() || !profile.postal_code?.trim()) {
    return PROFILE_BILLING_ERROR;
  }
  return null;
}

export function getCardIssueRedirect(message: string): CardIssueRedirect | null {
  if (/profile|address|full name|postal|street|city|billing|phone/i.test(message)) return "profile";
  if (/tier 3|tier_3|verification required|identity verification/i.test(message)) return "kyc";
  return null;
}

export function cardIssueActionLabel(redirect: CardIssueRedirect): string {
  return redirect === "profile" ? "Open Profile Settings" : "Complete verification";
}
