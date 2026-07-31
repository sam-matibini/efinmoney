/**
 * Canonical customer pricing service.
 *
 * Single source of truth for what eFinMoney charges a customer. Every flow
 * (send, FX swap, crypto swap, CPN, card push, top-up) must resolve its fee
 * through `quotePrice` so the rate card in `efinmoney_pricing` is the only
 * place a price is defined.
 *
 * The arithmetic itself is not duplicated here — it delegates to
 * `computeFee` / `computeCustomerRevenue` in routingEngine.ts.
 */
import { computeCustomerRevenue, type CustomerPricingRow } from "./routingEngine.ts";

export type PriceDirection = "payin" | "payout";

export interface QuotePriceRequest {
  direction: PriceDirection;
  sourceCurrency: string;
  destCurrency?: string | null;
  destCountry?: string | null;
  paymentMethod?: string | null;
  customerType?: string | null;
  amount: number;
}

export interface PriceQuote {
  /** Customer fee in source currency. */
  fee: number;
  /** FX margin revenue in source currency. */
  fxRevenue: number;
  /** fee + fxRevenue */
  total: number;
  /** FX margin expressed in basis points (apply to the mid rate). */
  fxMarginBps: number;
  /** Rate-card row that produced this quote, null when nothing matched. */
  pricingId: string | null;
  /** True when no rate-card row matched — fee falls back to 0. */
  pricingMissing: boolean;
  source: "rate_card" | "none";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Resolve the most specific active rate-card row and price the amount. */
export async function quotePrice(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  req: QuotePriceRequest,
): Promise<PriceQuote> {
  const amount = Number(req.amount) || 0;
  const src = (req.sourceCurrency || "").toUpperCase();
  const dst = (req.destCurrency || req.sourceCurrency || "").toUpperCase();

  const { data, error } = await supabase.rpc("resolve_customer_price", {
    p_direction: req.direction,
    p_source_currency: src,
    p_dest_currency: dst,
    p_dest_country: req.destCountry ? req.destCountry.toUpperCase() : null,
    p_payment_method: req.paymentMethod ?? null,
    p_customer_type: req.customerType ?? "consumer",
  });

  if (error) console.error("[pricingService] resolve_customer_price failed", error);

  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;

  if (!row) {
    return {
      fee: 0,
      fxRevenue: 0,
      total: 0,
      fxMarginBps: 0,
      pricingId: null,
      pricingMissing: true,
      source: "none",
    };
  }

  const pricing: CustomerPricingRow = {
    fixed_fee: Number(row.fixed_fee ?? 0),
    percentage_fee: Number(row.percentage_fee ?? 0),
    min_fee: row.min_fee == null ? null : Number(row.min_fee),
    max_fee: row.max_fee == null ? null : Number(row.max_fee),
    fx_markup_bps: Number(row.fx_margin_bps ?? 0),
  } as CustomerPricingRow;

  const revenue = computeCustomerRevenue(pricing, amount);

  return {
    fee: r2(revenue.fee),
    fxRevenue: r2(revenue.fx),
    total: r2(revenue.total),
    fxMarginBps: Number(row.fx_margin_bps ?? 0),
    pricingId: (row.id as string) ?? null,
    pricingMissing: false,
    source: "rate_card",
  };
}

/**
 * Server-side guard: compare a client-supplied fee against the rate card.
 * Returns the authoritative fee plus whether the client value was trustworthy.
 */
export async function assertQuotedFee(
  supabase: Parameters<typeof quotePrice>[0],
  req: QuotePriceRequest,
  claimedFee: number | null | undefined,
  toleranceAbs = 0.01,
): Promise<{ fee: number; quote: PriceQuote; matched: boolean; claimed: number | null }> {
  const quote = await quotePrice(supabase, req);
  const claimed = claimedFee == null || !Number.isFinite(Number(claimedFee))
    ? null
    : r2(Number(claimedFee));

  // Nothing on the rate card: fall back to what the caller supplied rather
  // than silently zero-rating a live transaction.
  if (quote.pricingMissing) {
    return { fee: claimed ?? 0, quote, matched: claimed == null, claimed };
  }

  const matched = claimed != null && Math.abs(claimed - quote.fee) <= toleranceAbs;
  return { fee: quote.fee, quote, matched, claimed };
}
