import { customerRateFromProvider } from "./fxCorridorBenchmark.ts";
import { quoteTransfer } from "./pricing/costRecoveryEngine.ts";

/** A live partner quote further than this from the published mid is treated as stale. */
export const SEND_QUOTE_MAX_DIVERGENCE = 0.03;

export type SendBenchmarkBasis = "live_partner" | "live_mid" | "unavailable";

export function pickSendBenchmark(opts: {
  liveMid?: number | null;
  partnerRate?: number | null;
  partnerSource?: string | null;
}): { benchmark: number; basis: SendBenchmarkBasis } {
  const mid = Number(opts.liveMid);
  const partner = Number(opts.partnerRate);
  const hasMid = Number.isFinite(mid) && mid > 0;
  const hasPartner = Number.isFinite(partner) && partner > 0;
  const livePartner = opts.partnerSource === "live_api" || opts.partnerSource === "composed";

  if (livePartner && hasPartner) {
    if (!hasMid) return { benchmark: partner, basis: "live_partner" };
    const gap = Math.abs(partner - mid) / mid;
    if (gap <= SEND_QUOTE_MAX_DIVERGENCE) return { benchmark: partner, basis: "live_partner" };
    return { benchmark: mid, basis: "live_mid" };
  }
  if (hasMid) return { benchmark: mid, basis: "live_mid" };
  if (hasPartner) return { benchmark: partner, basis: "live_partner" };
  return { benchmark: 0, basis: "unavailable" };
}

export function formatFxRate(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return Math.abs(value) < 20 ? value.toFixed(6) : value.toFixed(4);
}

export type SendLookup = {
  benchmark: number;
  basis: SendBenchmarkBasis;
  customerRate: number;
  spread: number;
  fee: number;
  scheduledFee: number;
  youReceive: number;
  liveMid: number | null;
};

/** Customer send quote for the selected pair. Amount 0 still returns the corridor fee and rate. */
export function quoteSendLookup(input: {
  sourceCurrency: string;
  destinationCurrency: string;
  payoutMethod: string;
  amount: number;
  liveMid?: number | null;
  partnerRate?: number | null;
  partnerSource?: string | null;
  cardFee?: number;
}): SendLookup {
  const source = input.sourceCurrency.toUpperCase();
  const dest = input.destinationCurrency.toUpperCase();
  const amount = Math.max(0, Number(input.amount) || 0);
  const cardFee = amount > 0 ? Math.max(0, Number(input.cardFee) || 0) : 0;

  if (source && source === dest) {
    return {
      benchmark: 1,
      basis: "live_mid",
      customerRate: 1,
      spread: 0,
      fee: cardFee,
      scheduledFee: 0,
      youReceive: amount,
      liveMid: 1,
    };
  }

  const picked = pickSendBenchmark({
    liveMid: input.liveMid,
    partnerRate: input.partnerRate,
    partnerSource: input.partnerSource,
  });
  const priced = quoteTransfer({
    sourceCurrency: source,
    destinationCurrency: dest,
    amount: amount > 0 ? amount : 1,
    channel: "external",
    payoutMethod: input.payoutMethod,
    midMarketRate: picked.benchmark > 0 ? picked.benchmark : null,
  });
  const spread = priced.fxSpread || 0;
  const customerRate = priced.customerRate && priced.customerRate > 0
    ? priced.customerRate
    : picked.benchmark > 0
      ? customerRateFromProvider(picked.benchmark, spread)
      : 0;
  const scheduledFee = priced.pricingMissing ? 0 : priced.transferFee;
  const fee = amount > 0 ? (priced.pricingMissing ? 0 : priced.transferFee) + cardFee : 0;
  const youReceive = amount > 0 && customerRate > 0
    ? (priced.youReceive ?? amount * customerRate)
    : 0;

  return {
    benchmark: picked.benchmark,
    basis: picked.basis,
    customerRate,
    spread,
    fee,
    scheduledFee,
    youReceive,
    liveMid: Number(input.liveMid) > 0 ? Number(input.liveMid) : null,
  };
}
