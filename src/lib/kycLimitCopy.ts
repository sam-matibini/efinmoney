/** Client copy of the KYC limit wording. Keep in step with supabase/functions/_shared/kycLimitCopy.ts. */

export type KycTierKey = "tier_2" | "tier_3";

export type KycLimitInput = {
  daily: number;
  monthly: number;
  single?: number;
  international?: boolean;
  virtualCard?: boolean;
};

export const SEEDED_KYC_LIMITS: Record<KycTierKey, KycLimitInput> = {
  tier_2: { daily: 3000, monthly: 3000, single: 3000, international: false, virtualCard: false },
  tier_3: { daily: 5000, monthly: 10000, single: 10000, international: true, virtualCard: true },
};

function finite(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function featureFlag(features: unknown, key: string): boolean | null {
  if (!features || typeof features !== "object" || Array.isArray(features)) return null;
  const value = (features as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : null;
}

export function moneyLimit(amount: number): string {
  return `$${finite(amount, 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function limitsFromTierRow(
  row: {
    daily_limit?: unknown;
    monthly_limit?: unknown;
    single_limit?: unknown;
    daily_transaction_limit?: unknown;
    monthly_transaction_limit?: unknown;
    single_transaction_limit?: unknown;
    features_enabled?: unknown;
  } | null | undefined,
  tier: KycTierKey,
): KycLimitInput {
  const fallback = SEEDED_KYC_LIMITS[tier];
  const international = featureFlag(row?.features_enabled, "international");
  const virtualCard = featureFlag(row?.features_enabled, "virtual_card");
  return {
    daily: finite(row?.daily_limit ?? row?.daily_transaction_limit, fallback.daily),
    monthly: finite(row?.monthly_limit ?? row?.monthly_transaction_limit, fallback.monthly),
    single: finite(row?.single_limit ?? row?.single_transaction_limit, fallback.single ?? fallback.daily),
    international: international ?? Boolean(fallback.international),
    virtualCard: tier === "tier_3" && (virtualCard ?? Boolean(fallback.virtualCard)),
  };
}

export function kycApprovalOptionDetail(limits: KycLimitInput): string {
  const extras: string[] = [];
  if (limits.international) extras.push("international");
  if (limits.virtualCard) extras.push("virtual cards");
  const tail = extras.length ? `, ${extras.join(" + ")}` : "";
  return `Up to ${moneyLimit(limits.daily)}/day, ${moneyLimit(limits.monthly)}/month${tail}`;
}
