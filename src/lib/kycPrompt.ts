import { nextTier, tierLabel, upgradeRoute, type Tier } from "@/lib/tierLimits";
import type { KycRecord, RiskTier } from "@/hooks/useKyc";

export type KycPromptVariant = "verify" | "continue" | "pending" | "rejected" | "upgrade";

export type KycPromptConfig = {
  variant: KycPromptVariant;
  title: string;
  message: string;
  cta: string;
  href: string;
  dismissible: boolean;
  perks: string[];
};

type ProfileLike = {
  kyc_status?: string | null;
  kyc_framework_version?: number | null;
} | null | undefined;

export function isKycFullyVerified(
  profile: ProfileLike,
  tier: RiskTier | null | undefined,
  kyc: KycRecord | null | undefined,
) {
  const profileVerified =
    profile?.kyc_status === "approved" || profile?.kyc_status === "verified";
  return profileVerified && tier?.current_tier === "tier_3";
}

export function getKycPromptConfig(
  profile: ProfileLike,
  tier: RiskTier | null | undefined,
  kyc: KycRecord | null | undefined,
): KycPromptConfig | null {
  if ((profile?.kyc_framework_version ?? 2) < 2) return null;
  if (!tier) return null;
  if (isKycFullyVerified(profile, tier, kyc)) return null;

  const current = tier.current_tier as Tier;
  const upgradeTo = nextTier(current);
  const perks =
    current === "tier_1"
      ? ["Higher send limits", "Top up wallets", "Bill payments"]
      : ["Virtual cards", "International transfers", "Business features"];

  if (kyc?.verification_status === "pending_review") {
    return {
      variant: "pending",
      title: "Verification under review",
      message: "We're reviewing your documents — this usually takes less than 24 hours.",
      cta: "View status",
      href: "/kyc",
      dismissible: true,
      perks: ["You'll get an email when approved", "Limits update automatically"],
    };
  }

  if (kyc?.verification_status === "rejected") {
    return {
      variant: "rejected",
      title: "Verification needs attention",
      message: "We couldn't approve your last submission. Review the details and try again.",
      cta: "Try again",
      href: upgradeRoute(current) + (current === "tier_1" ? "?autostart=persona" : ""),
      dismissible: false,
      perks,
    };
  }

  if (kyc?.verification_status === "in_progress") {
    return {
      variant: "continue",
      title: "Continue verification",
      message: "You're almost there — finish your ID check in about 2 minutes.",
      cta: "Continue",
      href: upgradeRoute(current) + (current === "tier_1" ? "?autostart=persona" : ""),
      dismissible: true,
      perks,
    };
  }

  if (upgradeTo) {
    return {
      variant: current === "tier_1" ? "verify" : "upgrade",
      title: current === "tier_1" ? "Verify your identity" : `Unlock ${tierLabel(upgradeTo)}`,
      message:
        current === "tier_1"
          ? "Complete a quick ID check to unlock sending, top-ups, and higher limits."
          : `Upgrade to ${tierLabel(upgradeTo)} for virtual cards and international transfers.`,
      cta: current === "tier_1" ? "Verify now" : "Upgrade tier",
      href: upgradeRoute(current) + (current === "tier_1" ? "?autostart=persona" : ""),
      dismissible: true,
      perks,
    };
  }

  return null;
}

const DISMISS_KEY = "efin_kyc_prompt_dismissed_at";
const DISMISS_MS = 24 * 60 * 60 * 1000;

export function isKycPromptDismissed(): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  return Number.isFinite(ts) && Date.now() - ts < DISMISS_MS;
}

export function dismissKycPrompt() {
  if (typeof window === "undefined") return;
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}
