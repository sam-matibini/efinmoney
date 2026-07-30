// Records the realised unit economics of a transfer: what the customer paid us,
// what the partner rail cost us, and the resulting gross profit.
// Reuses the routing engine math so estimates and actuals are computed identically.

import {
  computeCustomerRevenue,
  computePartnerCost,
  type CustomerPricingRow,
  type PartnerPricingRow,
} from "./routingEngine.ts";

type Client = { from: (t: string) => any };

const up = (v: unknown) => String(v ?? "").toUpperCase();
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface EconomicsContext {
  transfer_id: string;
  partner_id?: string | null;
  partner_code?: string | null;
  routing_decision_id?: string | null;
  source: "routed" | "legacy" | "backfill";
  customer_type?: string;
  /** Fee actually charged to the customer, when known (overrides pricing table). */
  actual_customer_fee?: number | null;
  settled_at?: string | null;
}

export interface EconomicsRequest {
  source_currency: string;
  dest_currency: string;
  dest_country?: string | null;
  payment_method?: string | null;
  amount: number;
  direction?: "payin" | "payout" | "both";
}

async function resolvePartnerId(
  supabase: Client,
  ctx: EconomicsContext,
): Promise<string | null> {
  if (ctx.partner_id) return ctx.partner_id;
  if (!ctx.partner_code) return null;
  const { data } = await supabase
    .from("payment_partners")
    .select("id")
    .eq("code", ctx.partner_code)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Compute and persist a `transaction_economics` row.
 * Idempotent via the unique index on transfer_id; never throws.
 */
export async function recordEconomics(
  supabase: Client,
  req: EconomicsRequest,
  ctx: EconomicsContext,
): Promise<string | null> {
  try {
    const srcCcy = up(req.source_currency);
    const dstCcy = up(req.dest_currency || req.source_currency);
    const dstCountry = req.dest_country ? up(req.dest_country) : null;
    const method = req.payment_method ?? null;
    const amount = Number(req.amount) || 0;
    const partnerId = await resolvePartnerId(supabase, ctx);

    // Partner-side cost
    let partnerPricing: PartnerPricingRow | null = null;
    if (partnerId) {
      const { data: rows } = await supabase
        .from("partner_pricing")
        .select("*")
        .eq("partner_id", partnerId)
        .eq("source_currency", srcCcy)
        .eq("dest_currency", dstCcy)
        .is("effective_to", null);
      partnerPricing =
        ((rows ?? []).find(
          (p: any) =>
            (!p.payment_method || p.payment_method === "any" || p.payment_method === method) &&
            (!p.dest_country || !dstCountry || up(p.dest_country) === dstCountry),
        ) ?? null) as PartnerPricingRow | null;
    }

    // Customer-side revenue
    const { data: custRows } = await supabase
      .from("efinmoney_pricing")
      .select("*")
      .eq("source_currency", srcCcy)
      .eq("dest_currency", dstCcy)
      .is("effective_to", null);

    const cust = (custRows ?? []).find(
      (c: any) =>
        (!c.customer_type || c.customer_type === (ctx.customer_type ?? "consumer")) &&
        (!c.payment_method || !method || c.payment_method === method) &&
        (!c.dest_country || !dstCountry || up(c.dest_country) === dstCountry),
    );

    const customerPricing: CustomerPricingRow | null = cust
      ? {
          fixed_fee: cust.fixed_fee,
          percentage_fee: cust.percentage_fee,
          min_fee: cust.min_fee,
          max_fee: cust.max_fee,
          fx_markup_bps: cust.fx_margin_bps,
        }
      : null;

    const cost = computePartnerCost(partnerPricing, amount);
    const revenue = computeCustomerRevenue(customerPricing, amount);

    // Prefer the fee actually charged on the transfer over the pricing table.
    const feeRevenue =
      ctx.actual_customer_fee != null && Number.isFinite(Number(ctx.actual_customer_fee))
        ? r2(Number(ctx.actual_customer_fee))
        : revenue.fee;

    const totalRevenue = r2(feeRevenue + revenue.fx);
    const totalCost = cost.total;
    const profit = r2(totalRevenue - totalCost);

    const row = {
      transfer_id: ctx.transfer_id,
      routing_decision_id: ctx.routing_decision_id ?? null,
      partner_id: partnerId,
      direction: req.direction ?? "payout",
      source_currency: srcCcy,
      dest_currency: dstCcy,
      dest_country: dstCountry,
      payment_method: method,
      customer_type: ctx.customer_type ?? "consumer",
      amount,
      customer_fee_revenue: feeRevenue,
      customer_fx_revenue: revenue.fx,
      partner_fee_cost: cost.fee,
      partner_fx_cost: cost.fxCost,
      settlement_cost: cost.settlement,
      network_cost: cost.network,
      compliance_cost: cost.compliance,
      infrastructure_cost: 0,
      total_revenue: totalRevenue,
      total_cost: totalCost,
      gross_profit: profit,
      margin_percent: totalRevenue > 0 ? r2((profit / totalRevenue) * 100) : 0,
      currency_code: srcCcy,
      economics_source: ctx.source,
      pricing_missing: !partnerPricing,
      settled_at: ctx.settled_at ?? new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("transaction_economics")
      .upsert(row, { onConflict: "transfer_id" })
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("recordEconomics insert failed", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.error("recordEconomics failed", e instanceof Error ? e.message : e);
    return null;
  }
}
