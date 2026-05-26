import { supabase } from "@/integrations/supabase/client";

export type Tier = "tier_1" | "tier_2" | "tier_3" | "tier_4";

export interface TierLimits {
  tier: Tier;
  label: string;
  max_balance: number;
  daily_limit: number;
  monthly_limit: number;
  single_limit: number;
  features_enabled: Record<string, boolean>;
}

const NEXT_TIER: Record<Tier, Tier | null> = {
  tier_1: "tier_2",
  tier_2: "tier_3",
  tier_3: null,
  tier_4: null,
};

const UPGRADE_ROUTE: Record<Tier, string> = {
  tier_1: "/onboarding/identity",
  tier_2: "/onboarding/enhanced",
  tier_3: "/onboarding/enhanced",
  tier_4: "/onboarding/enhanced",
};

export const tierLabel = (t: Tier) =>
  ({ tier_1: "Minimal", tier_2: "Standard", tier_3: "Enhanced", tier_4: "Premium" }[t]);

export const nextTier = (t: Tier) => NEXT_TIER[t];
export const upgradeRoute = (t: Tier) => UPGRADE_ROUTE[t];

/**
 * Lightweight tier limit check. Returns whether the requested transaction
 * amount fits inside the user's current single/daily/monthly ceilings.
 * The DB-side trigger (check_transfer_balance) still validates wallet
 * balance; this is the *tier* gate that lives in the UI.
 */
export interface LimitCheckInput {
  userId: string;
  amountUsd: number;
  currentTier: Tier;
  singleLimit: number;
  dailyLimit: number;
  monthlyLimit: number;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  requiredTier?: Tier;
  upgradeTo?: Tier | null;
  upgradeRoute?: string;
}

export async function checkTransactionAllowed(
  input: LimitCheckInput,
): Promise<LimitCheckResult> {
  const { userId, amountUsd, currentTier, singleLimit, dailyLimit, monthlyLimit } = input;

  if (amountUsd > singleLimit) {
    return blocked(
      `This transfer of $${amountUsd.toLocaleString()} exceeds your per-transaction limit of $${singleLimit.toLocaleString()}.`,
      currentTier,
    );
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Sum of completed/pending outbound transfers from this user
  const { data, error } = await supabase
    .from("transfers")
    .select("source_amount, created_at, status")
    .eq("sender_id", userId)
    .gte("created_at", startOfMonth)
    .in("status", ["initiated", "funded", "processing", "completed"]);

  if (error) {
    // Fail open on read error so we don't trap the user; server trigger still applies.
    return { allowed: true };
  }

  const daily = (data ?? [])
    .filter((r) => r.created_at >= startOfDay)
    .reduce((s, r) => s + Number(r.source_amount || 0), 0);
  const monthly = (data ?? []).reduce((s, r) => s + Number(r.source_amount || 0), 0);

  if (daily + amountUsd > dailyLimit) {
    return blocked(
      `Adding this would exceed your daily limit of $${dailyLimit.toLocaleString()} (you've used $${daily.toLocaleString()} today).`,
      currentTier,
    );
  }
  if (monthly + amountUsd > monthlyLimit) {
    return blocked(
      `Adding this would exceed your monthly limit of $${monthlyLimit.toLocaleString()} (you've used $${monthly.toLocaleString()} this month).`,
      currentTier,
    );
  }

  return { allowed: true };
}

function blocked(reason: string, currentTier: Tier): LimitCheckResult {
  const upgradeTo = nextTier(currentTier);
  return {
    allowed: false,
    reason,
    requiredTier: upgradeTo ?? currentTier,
    upgradeTo,
    upgradeRoute: upgradeTo ? upgradeRoute(currentTier) : undefined,
  };
}
