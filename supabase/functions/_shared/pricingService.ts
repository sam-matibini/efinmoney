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
import { resolveEffectiveRate, type RateRow } from "./fxRatesCore.ts";
import { retailPayoutFeeNative, retailPayoutFeeUsd } from "./retailPayoutFees.ts";

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
  source: "rate_card" | "retail_override" | "none";
}

type PricingClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  // deno-lint-ignore no-explicit-any
  from?: (table: string) => any;
};

async function loadFxRows(supabase: PricingClient): Promise<RateRow[] | null> {
  if (!supabase.from) return null;
  const { data, error } = await supabase
    .from("fx_rates")
    .select("from_currency, to_currency, effective_rate")
    .order("valid_from", { ascending: false })
    .limit(400);
  if (error) {
    console.error("[pricingService] fx_rates lookup failed", error);
    return null;
  }
  return (Array.isArray(data) ? data : []) as RateRow[];
}

async function feeInSourceCurrency(
  supabase: PricingClient,
  amount: number,
  feeCurrency: string,
  sourceCurrency: string,
): Promise<number | null> {
  const feeCcy = feeCurrency.toUpperCase();
  const src = sourceCurrency.toUpperCase();
  if (feeCcy === src) return r2(amount);
  const rows = await loadFxRows(supabase);
  if (!rows) return null;
  const rate = resolveEffectiveRate(feeCcy, src, rows);
  if (!rate || rate <= 0) {
    console.warn(`[pricingService] no ${feeCcy}→${src} rate for retail fee`);
    return null;
  }
  return r2(amount * rate);
}

async function usdFeeInSource(
  supabase: PricingClient,
  usd: number,
  sourceCurrency: string,
): Promise<number | null> {
  return feeInSourceCurrency(supabase, usd, "USD", sourceCurrency);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Resolve the most specific active rate-card row and price the amount. */
export async function quotePrice(
  supabase: PricingClient,
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

  let quote: PriceQuote;
  if (!row) {
    quote = {
      fee: 0,
      fxRevenue: 0,
      total: 0,
      fxMarginBps: 0,
      pricingId: null,
      pricingMissing: true,
      source: "none",
    };
  } else {
    const pricing: CustomerPricingRow = {
      fixed_fee: Number(row.fixed_fee ?? 0),
      percentage_fee: Number(row.percentage_fee ?? 0),
      min_fee: row.min_fee == null ? null : Number(row.min_fee),
      max_fee: row.max_fee == null ? null : Number(row.max_fee),
      fx_markup_bps: Number(row.fx_margin_bps ?? 0),
    } as CustomerPricingRow;

    const revenue = computeCustomerRevenue(pricing, amount);

    quote = {
      fee: r2(revenue.fee),
      fxRevenue: r2(revenue.fx),
      total: r2(revenue.total),
      fxMarginBps: Number(row.fx_margin_bps ?? 0),
      pricingId: (row.id as string) ?? null,
      pricingMissing: false,
      source: "rate_card",
    };
  }

  if (req.direction !== "payout") return quote;

  // Native flat fees first (e.g. ₦200 for NGN bank payout).
  const native = retailPayoutFeeNative(dst) ?? retailPayoutFeeNative(req.destCountry);
  if (native) {
    const converted = await feeInSourceCurrency(supabase, native.amount, native.currency, src);
    if (converted != null) {
      return {
        ...quote,
        fee: converted,
        total: r2(converted + quote.fxRevenue),
        pricingMissing: false,
        source: "retail_override",
      };
    }
  }

  const usdFee = retailPayoutFeeUsd(dst) ?? retailPayoutFeeUsd(req.destCountry);
  if (usdFee == null) return quote;

  const converted = await usdFeeInSource(supabase, usdFee, src);
  if (converted == null) return quote;

  return {
    ...quote,
    fee: converted,
    total: r2(converted + quote.fxRevenue),
    pricingMissing: false,
    source: "retail_override",
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
