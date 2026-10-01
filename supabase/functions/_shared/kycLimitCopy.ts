/** KYC transfer-limit copy. Matches public.tier_limits. No Deno or network calls. */

export type KycTierKey = "tier_2" | "tier_3";

export type KycLimitInput = {
  daily: number;
  monthly: number;
  single?: number;
  international?: boolean;
  virtualCard?: boolean;
};

/** Seeded personal limits from the tier_limits migration. Tier 4 is not a KYC approval. */
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

export function limitsFromEmailData(data: Record<string, unknown> | undefined, tier: KycTierKey): KycLimitInput {
  const raw = data?.daily_limit;
  if (raw === undefined || raw === null || raw === "") return { ...SEEDED_KYC_LIMITS[tier] };
  return {
    daily: finite(data?.daily_limit, SEEDED_KYC_LIMITS[tier].daily),
    monthly: finite(data?.monthly_limit, SEEDED_KYC_LIMITS[tier].monthly),
    single: finite(data?.single_limit, SEEDED_KYC_LIMITS[tier].single ?? 0),
    international: data?.international === true,
    virtualCard: data?.virtual_card === true,
  };
}

/** Sentence used in the approval email: "up to $5,000/day and $10,000/month, including …". */
export function kycSendLimitPhrase(limits: KycLimitInput): string {
  let phrase = `up to ${moneyLimit(limits.daily)}/day and ${moneyLimit(limits.monthly)}/month`;
  const extras: string[] = [];
  if (limits.international) extras.push("international transfers");
  if (limits.virtualCard) extras.push("virtual cards");
  if (extras.length) phrase += `, including ${extras.join(" and ")}`;
  return phrase;
}

/** Short line for the admin approval choices. */
export function kycApprovalOptionDetail(limits: KycLimitInput): string {
  const extras: string[] = [];
  if (limits.international) extras.push("international");
  if (limits.virtualCard) extras.push("virtual cards");
  const tail = extras.length ? `, ${extras.join(" + ")}` : "";
  return `Up to ${moneyLimit(limits.daily)}/day, ${moneyLimit(limits.monthly)}/month${tail}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function kycApprovedInnerHtml(opts: { name?: string; tierLabel: string; limits: KycLimitInput }): string {
  const name = opts.name?.trim() ? `, ${escapeHtml(opts.name.trim())}` : "";
  const limits = escapeHtml(kycSendLimitPhrase(opts.limits));
  return `
      <div style="text-align:center;margin:0 0 18px">
        <div style="display:inline-block;width:64px;height:64px;line-height:64px;border-radius:50%;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#ffffff;font-size:32px;box-shadow:0 8px 20px -6px rgba(16,185,129,0.5)">✓</div>
      </div>
      <h1 style="margin:0 0 8px;font-family:'Space Grotesk','Inter',sans-serif;font-size:26px;font-weight:700;color:#0f172a;text-align:center;letter-spacing:-0.02em">Identity verified</h1>
      <p style="margin:0 0 22px;line-height:1.6;color:#334155;text-align:center">Great news${name}! Your identity verification has been approved.</p>
      <div style="margin:0 0 20px;padding:22px;border:1px solid #bbf7d0;border-radius:12px;background:linear-gradient(135deg,#f0fdf4 0%,#ecfdf5 100%);text-align:center">
        <p style="margin:0 0 4px;color:#065f46;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Account level</p>
        <p style="margin:0;font-family:'Space Grotesk','Inter',sans-serif;font-size:22px;font-weight:700;color:#065f46;letter-spacing:-0.01em">${escapeHtml(opts.tierLabel)} — Verified</p>
        <p style="margin:10px 0 0;color:#047857;font-size:13px;line-height:1.5">You can now send ${limits}.</p>
      </div>
      <p style="margin:0;line-height:1.6;color:#334155;text-align:center">Sign in to your dashboard to start sending money.</p>
    `;
}
