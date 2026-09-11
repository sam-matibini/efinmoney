/** Keep in sync with src/lib/pricing/costRecoveryEngine.ts */
/**
 * eFinMoney cost-recovery pricing engine.
 *
 * Customer Price = Partner Cost + Internal Cost + Risk Cost + FX Spread + Margin
 * Customer Fee    = MAX(Minimum Fee, Variable Fee + Fixed Cost Recovery, Cost Recovery Floor)
 *
 * Starting commercial rates live in the administrator-controlled rate card.
 * This module never hard-codes a 0.5% consumer fee.
 */
import type {
  CorridorRateCard,
  CostBreakdown,
  CustomerSegment,
  PricingChannel,
  QuoteInput,
  TransferQuote,
} from "./types.ts";
import {
  CUSTOMER_CORRIDOR_RATES,
  DEFAULT_TRANSFER_FEE_PCT,
  STABLECOIN_PEGS,
  WALLET_RATES,
  normalizeCurrency,
  payoutMethodFromInput,
} from "./rateCard.ts";
import { getActiveRateCards, getPayoutMins, getVolumeTiers } from "./workbookStore.ts";

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const r6 = (n: number) => Math.round((Number(n) || 0) * 1_000_000) / 1_000_000;

export function customerRateFromMid(midMarketRate: number, fxSpread: number): number {
  const mid = Number(midMarketRate);
  const spread = Math.max(0, Number(fxSpread) || 0);
  if (!Number.isFinite(mid) || mid <= 0) return 0;
  return r6(mid * (1 - spread));
}

export function resolveVolumeTier(monthlyVolume = 0) {
  const volume = Math.max(0, Number(monthlyVolume) || 0);
  const tiers = getVolumeTiers();
  const tier =
    [...tiers].reverse().find((t) => volume >= t.min_monthly_volume) ??
    tiers[0];
  return tier;
}

export function findPayoutMinimum(method: string, feeCurrency = "CAD"): number {
  const row = getPayoutMins().find((p) => p.payout_method === method);
  if (!row) return 0;
  return row.fee_currency === feeCurrency ? row.minimum_fee : row.minimum_fee;
}

function scoreCard(
  card: CorridorRateCard,
  source: string,
  dest: string,
  method: string,
  partner: string | null,
): number {
  let score = 0;
  if (card.source_currency === source) score += 16;
  else if (card.source_currency === "*") score += 1;
  else return -1;
  if (card.destination_currency === dest) score += 16;
  else if (card.destination_currency === "*") score += 1;
  else return -1;
  if (card.payout_method === method) score += 8;
  else if (card.payout_method === "WALLET_BANK" && (method === "WALLET" || method === "BANK" || method === "MOBILE_MONEY"))
    score += 4;
  else if (method === "WALLET_TO_WALLET" && card.payout_method === "WALLET_TO_WALLET") score += 8;
  else return -1;
  if (partner && card.partner && card.partner.toLowerCase() === partner.toLowerCase()) score += 2;
  if (card.active) score += 1;
  return score;
}

export function resolveCorridorRate(
  input: Pick<QuoteInput, "sourceCurrency" | "destinationCurrency" | "payoutMethod" | "partner" | "channel">,
  cards: CorridorRateCard[] = getActiveRateCards(),
): CorridorRateCard | null {
  const source = normalizeCurrency(input.sourceCurrency);
  const dest = normalizeCurrency(input.destinationCurrency);
  const channel: PricingChannel = input.channel ?? "wallet";
  const method = payoutMethodFromInput(input.payoutMethod, channel);
  const pool = cards.filter((c) => c.active && c.channel === channel);

  let best: CorridorRateCard | null = null;
  let bestScore = -1;
  for (const card of pool) {
    const score = scoreCard(card, source, dest, method, input.partner ?? null);
    if (score > bestScore) {
      best = card;
      bestScore = score;
    }
  }

  if (best) return best;

  if (channel === "wallet" && source === dest) {
    return WALLET_RATES.find((c) => c.corridor_id === "WALLET_SAME_CURRENCY") ?? null;
  }

  if (channel === "wallet") {
    const sameCcy = source === dest;
    const african = CUSTOMER_CORRIDOR_RATES.filter(
      (c) => c.source_currency === source && c.destination_currency === dest,
    );
    const closest = african.sort((a, b) => a.efin_fx_spread - b.efin_fx_spread)[0];
    const same = WALLET_RATES.find((c) => c.corridor_id === "WALLET_SAME_CURRENCY");
    if (sameCcy) return same ?? null;
    if (closest && same) {
      return {
        ...same,
        corridor_id: `WALLET_${source}_${dest}`,
        source_currency: source,
        destination_currency: dest,
        efin_fx_spread: Math.min(closest.efin_fx_spread, 0.015),
        transfer_fee: Math.min(closest.minimum_fee, 1.5),
        minimum_fee: Math.min(closest.minimum_fee, 1.5),
        efin_transfer_fee_pct: DEFAULT_TRANSFER_FEE_PCT,
      };
    }
    return same
      ? {
          ...same,
          corridor_id: `WALLET_${source}_${dest}`,
          source_currency: source,
          destination_currency: dest,
          efin_fx_spread: source === dest ? 0 : 0.005,
          efin_transfer_fee_pct: source === dest ? 0 : DEFAULT_TRANSFER_FEE_PCT,
        }
      : null;
  }

  return CUSTOMER_CORRIDOR_RATES.find(
    (c) => c.source_currency === source && c.destination_currency === dest,
  ) ?? null;
}

export function computeCostBreakdown(amount: number, card: CorridorRateCard): CostBreakdown {
  const c = card.costs;
  const partnerCost = amount * c.partner_cost_pct + c.partner_fixed_fee;
  const paymentCost = amount * c.payment_cost_pct + c.payment_fixed_fee;
  const payoutCost = c.payout_cost_fixed;
  const liquidityCost = amount * c.liquidity_cost_pct;
  const riskCost = amount * c.risk_cost_pct;
  const totalCost = partnerCost + paymentCost + payoutCost + liquidityCost + riskCost;
  return {
    partnerCost: r2(partnerCost),
    paymentCost: r2(paymentCost),
    payoutCost: r2(payoutCost),
    liquidityCost: r2(liquidityCost),
    riskCost: r2(riskCost),
    totalCost: r2(totalCost),
  };
}

function isBusinessSegment(segment: string | null | undefined): boolean {
  const s = String(segment || "consumer").toLowerCase();
  return s === "business" || s === "enterprise" || s === "partner_api" || s === "b2b" || s === "corporate";
}

export function quoteTransfer(
  input: QuoteInput,
  cards: CorridorRateCard[] = getActiveRateCards(),
): TransferQuote {
  const source = normalizeCurrency(input.sourceCurrency);
  const dest = normalizeCurrency(input.destinationCurrency);
  const channel: PricingChannel = input.channel ?? "wallet";
  const amount = Math.max(0, Number(input.amount) || 0);
  const segment = (input.customerType as CustomerSegment) || "consumer";
  const method = payoutMethodFromInput(input.payoutMethod, channel);
  const card = resolveCorridorRate({ ...input, channel, payoutMethod: method }, cards);

  const empty: TransferQuote = {
    corridorId: `${source}_${dest}`,
    channel,
    payoutMethod: method,
    sourceCurrency: source,
    destinationCurrency: dest,
    amount,
    midMarketRate: input.midMarketRate ?? null,
    customerRate: input.midMarketRate ?? null,
    fxSpread: 0,
    transferFeePct: 0,
    volumeDiscount: 0,
    volumeTierLabel: "Standard",
    requiresNegotiation: false,
    variableFee: 0,
    minimumFee: 0,
    maximumFee: null,
    transferFee: 0,
    fxMargin: 0,
    feeCurrency: source || "CAD",
    cost: { partnerCost: 0, paymentCost: 0, payoutCost: 0, liquidityCost: 0, riskCost: 0, totalCost: 0 },
    requiredMargin: 0,
    minimumRevenue: 0,
    totalRevenue: 0,
    grossContribution: 0,
    floorApplied: false,
    youSend: amount,
    totalCharged: amount,
    youReceive: null,
    estimatedDelivery: channel === "wallet" ? "Instant" : "Varies",
    recommendedPosition: "Competitive",
    pricingMissing: true,
  };

  if (!card || amount <= 0) return empty;

  const tier = resolveVolumeTier(input.monthlyVolume);
  const feeDiscount = tier.transfer_fee_discount ?? 0;
  const spreadDiscount = tier.fx_spread_discount ?? 0;
  const listSpread = isBusinessSegment(segment) && input.negotiatedFxSpread != null
    ? Number(input.negotiatedFxSpread)
    : card.efin_fx_spread;
  const fxSpread = Math.max(0, listSpread * (1 - spreadDiscount));
  const transferFeePct = Math.max(0, card.efin_transfer_fee_pct * (1 - feeDiscount));
  const methodMin = findPayoutMinimum(method, card.fee_currency);
  const corridorMin = card.minimum_fee * (1 - feeDiscount);
  const minimumFee = r2(Math.max(corridorMin, methodMin * (1 - feeDiscount), card.transfer_fee * (1 - feeDiscount)));

  const variableFee = r2(amount * transferFeePct);
  let transferFee = Math.max(minimumFee, variableFee);

  const cost = computeCostBreakdown(amount, card);
  const requiredMargin = card.costs.required_margin;
  const minimumRevenue = r2(cost.totalCost + requiredMargin);

  const mid = input.midMarketRate != null && Number(input.midMarketRate) > 0 ? Number(input.midMarketRate) : null;
  let customerRate = mid != null ? customerRateFromMid(mid, fxSpread) : null;
  const fxMargin = r2(amount * fxSpread);

  let totalRevenue = r2(transferFee + fxMargin);
  let floorApplied = false;
  if (totalRevenue < minimumRevenue) {
    transferFee = r2(Math.max(transferFee, minimumRevenue - fxMargin));
    totalRevenue = r2(transferFee + fxMargin);
    floorApplied = true;
  }

  if (card.maximum_fee != null && transferFee > card.maximum_fee) {
    transferFee = r2(card.maximum_fee);
    totalRevenue = r2(transferFee + fxMargin);
  }

  if (source === dest) customerRate = 1;

  const feeFromSend = channel === "wallet";
  const youSend = amount;
  const convertible = feeFromSend ? Math.max(0, amount - transferFee) : amount;
  const totalCharged = feeFromSend ? amount : r2(amount + transferFee);
  const youReceive = customerRate != null ? r2(convertible * customerRate) : null;

  return {
    corridorId: card.corridor_id,
    channel,
    payoutMethod: method,
    sourceCurrency: source,
    destinationCurrency: dest,
    amount,
    midMarketRate: mid,
    customerRate: source === dest ? 1 : customerRate,
    fxSpread,
    transferFeePct,
    volumeDiscount: feeDiscount,
    volumeTierLabel: tier.label,
    requiresNegotiation: Boolean(tier.custom) || (isBusinessSegment(segment) && input.negotiatedFxSpread == null),
    variableFee,
    minimumFee,
    maximumFee: card.maximum_fee,
    transferFee,
    fxMargin,
    feeCurrency: card.fee_currency || source,
    cost,
    requiredMargin,
    minimumRevenue,
    totalRevenue,
    grossContribution: r2(totalRevenue - cost.totalCost),
    floorApplied,
    youSend,
    totalCharged,
    youReceive,
    estimatedDelivery: card.estimated_delivery,
    recommendedPosition: card.recommended_position,
    pricingMissing: false,
  };
}

export function invertSendAmount(
  receiveAmount: number,
  input: Omit<QuoteInput, "amount"> & { amount?: number },
  cards?: CorridorRateCard[],
): number {
  const recv = Number(receiveAmount) || 0;
  if (recv <= 0) return 0;
  const probe = quoteTransfer({ ...input, amount: recv }, cards);
  const rate = probe.customerRate;
  if (!rate || rate <= 0) return 0;

  const pct = probe.transferFeePct;
  if (input.channel !== "wallet") {
    const withoutMin = recv / rate;
    const withMin = quoteTransfer({ ...input, amount: withoutMin }, cards);
    if (withMin.transferFee <= withMin.variableFee + 0.0001) return r2(withoutMin);
    return r2(withoutMin);
  }

  const sendIfPct = recv / (rate * (1 - pct));
  const feeIfPct = sendIfPct * pct;
  if (feeIfPct >= probe.minimumFee) return r2(sendIfPct);
  return r2(recv / rate + probe.minimumFee);
}

export function formatCustomerRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return "—";
  if (rate >= 100) return rate.toFixed(2);
  if (rate >= 1) return rate.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
  return rate.toFixed(5);
}

export { STABLECOIN_PEGS };
