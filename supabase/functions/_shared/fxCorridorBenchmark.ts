/**
 * Corridor FX quoting:
 *
 *   EFRR (BoC / OXR)  →  partner execution rate  →  eFinMoney cost
 *     →  customer rate = benchmark × (1 − internal EX spread)
 *
 * EFRR is the compliance/accounting reference. Live payout-rail FX is the
 * execution/settlement source and is preferred for customer quotes so Africa
 * corridors are not priced off a published mid we cannot actually obtain.
 * Never stack `fx_rates.effective_rate`.
 */

export const FX_CORRIDOR_RULE =
  "Customer FX = (partner execution rate || EFRR) × (1 − eFinMoney internal EX spread)";

/** Live partner-rates-refresh rows expire ~15 minutes after they were pulled. */
export const LIVE_PROVIDER_TTL_MS = 20 * 60 * 1000;

export type CorridorFxSource = "live_api" | "manual" | "composed" | "partner_book" | "treasury_mid";

export type CorridorProviderQuote = {
  partnerCode: string;
  rate: number;
  source: CorridorFxSource;
  rateTimestamp?: string | null;
  expiresAt?: string | null;
};

export type FxBenchmark = {
  rate: number;
  source: CorridorFxSource | "unavailable";
  partnerCode: string | null;
};

const r6 = (n: number) => Math.round((Number(n) || 0) * 1_000_000) / 1_000_000;

export function partnerKey(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function partnersMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = partnerKey(a);
  const right = partnerKey(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function isFreshLiveTtl(rateTimestamp?: string | null, expiresAt?: string | null): boolean {
  const ts = rateTimestamp ? Date.parse(rateTimestamp) : NaN;
  const exp = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(ts) || !Number.isFinite(exp) || exp <= Date.now()) return false;
  const ttl = exp - ts;
  return ttl > 0 && ttl <= LIVE_PROVIDER_TTL_MS;
}

/** Operator-set or live API quote we will actually convert against. */
export function isUsableProviderQuote(quote: CorridorProviderQuote): boolean {
  if (!(Number(quote.rate) > 0)) return false;
  if (quote.source === "treasury_mid" || quote.source === "partner_book") return false;
  if (quote.source === "live_api" || quote.source === "composed") return true;
  if (quote.source === "manual") {
    if (!quote.expiresAt) return true;
    const exp = Date.parse(quote.expiresAt);
    return !Number.isFinite(exp) || exp > Date.now();
  }
  return false;
}

export function classifyPartnerFxRow(row: {
  source?: string | null;
  rateTimestamp?: string | null;
  expiresAt?: string | null;
}): CorridorFxSource {
  const src = String(row.source || "").toLowerCase();
  if (src === "manual" || src === "partner_portal" || src === "file") return "manual";
  if (src === "api" && isFreshLiveTtl(row.rateTimestamp, row.expiresAt)) return "live_api";
  return "partner_book";
}

export function pickCorridorProviderBenchmark(
  quotes: CorridorProviderQuote[],
  preferredPartner?: string | null,
): CorridorProviderQuote | null {
  const usable = quotes.filter(isUsableProviderQuote);
  if (!usable.length) return null;

  const preferredLive = preferredPartner
    ? usable.find((q) => partnersMatch(q.partnerCode, preferredPartner))
    : undefined;
  if (preferredLive) return preferredLive;

  return usable.reduce((best, q) => (q.rate > best.rate ? q : best));
}

export function composeProviderCrossRate(
  fromToUsd: number | null | undefined,
  usdToDest: number | null | undefined,
): number | null {
  const a = Number(fromToUsd);
  const b = Number(usdToDest);
  if (!(a > 0) || !(b > 0)) return null;
  return r6(a * b);
}

export function resolveFxBenchmark(opts: {
  providerQuotes: CorridorProviderQuote[];
  preferredPartner?: string | null;
  treasuryMid?: number | null;
}): FxBenchmark {
  const picked = pickCorridorProviderBenchmark(opts.providerQuotes, opts.preferredPartner);
  if (picked) {
    return { rate: picked.rate, source: picked.source, partnerCode: picked.partnerCode };
  }
  const mid = Number(opts.treasuryMid);
  if (Number.isFinite(mid) && mid > 0) {
    return { rate: mid, source: "treasury_mid", partnerCode: null };
  }
  return { rate: 0, source: "unavailable", partnerCode: null };
}

/** Customer rate from a provider (or treasury-mid fallback) + internal margin. */
export function customerRateFromProvider(providerRate: number, internalMargin: number): number {
  const rate = Number(providerRate);
  const margin = Math.max(0, Number(internalMargin) || 0);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return r6(rate * (1 - margin));
}
