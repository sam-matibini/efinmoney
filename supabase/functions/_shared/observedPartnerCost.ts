// Phase 2 of live partner pricing: record what a partner ACTUALLY billed us on
// a transaction and compare it to their contracted rate card, so drift shows up
// in the pricing dashboard and in partner cost-variance scoring.
//
// Every call is best-effort: a capture failure must never break a payout or a
// webhook acknowledgement.

type Sb = {
  from: (t: string) => any;
};

export interface ObservedCostInput {
  /** Partner routing code, e.g. "flutterwave" / "nomba" / "fincra". */
  partnerCode: string;
  transferId?: string | null;
  direction?: "payin" | "payout";
  sourceCurrency: string;
  destCurrency?: string | null;
  destCountry?: string | null;
  paymentMethod?: string | null;
  /** Transaction principal in the currency the fee was charged in. */
  amount: number;
  /** Fee the partner actually charged. */
  observedFee: number;
  /** Effective FX spread in bps, when the provider exposed their rate. */
  observedFxBps?: number | null;
  feeCurrency?: string | null;
  /** Provider-side id/reference — keeps captures idempotent. */
  providerReference?: string | null;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

interface Tier {
  min?: number;
  max?: number;
  fixed_fee?: number;
  percentage_fee?: number;
}

/** Contracted fee for `amount`, mirroring routingEngine.computeFee. */
function contractedFee(row: Record<string, unknown> | null, amount: number): number | null {
  if (!row) return null;
  const tiers = (row.tiers as Tier[] | null) ?? null;
  let fixed = num(row.fixed_fee);
  let pct = num(row.percentage_fee);
  if (Array.isArray(tiers) && tiers.length) {
    const tier = tiers.find(
      (t) => amount >= num(t.min ?? 0) && (t.max == null || amount <= num(t.max)),
    );
    if (tier) {
      fixed = num(tier.fixed_fee ?? fixed);
      pct = num(tier.percentage_fee ?? pct);
    }
  }
  let fee = fixed + (amount * pct) / 100;
  if (row.min_fee != null) fee = Math.max(fee, num(row.min_fee));
  if (row.max_fee != null) fee = Math.min(fee, num(row.max_fee));
  return Math.round(fee * 100) / 100;
}

/**
 * Capture an observed partner cost. Returns the drift percentage when a
 * contracted price was found, otherwise null.
 */
export async function recordObservedPartnerCost(
  supabase: Sb,
  input: ObservedCostInput,
): Promise<number | null> {
  try {
    const src = input.sourceCurrency?.toUpperCase();
    if (!src || !Number.isFinite(input.amount) || input.amount <= 0) return null;

    const { data: partner } = await supabase
      .from("payment_partners")
      .select("id")
      .eq("code", input.partnerCode)
      .maybeSingle();
    if (!partner?.id) return null;

    const dst = input.destCurrency ? input.destCurrency.toUpperCase() : null;
    const country = input.destCountry ? input.destCountry.toUpperCase() : null;
    const direction = input.direction === "payin" ? "payin" : "payout";

    const { data: cards } = await supabase
      .from("partner_pricing")
      .select("*")
      .eq("partner_id", partner.id)
      .eq("direction", direction)
      .limit(50);

    const card =
      (cards ?? []).find(
        (c: Record<string, unknown>) =>
          String(c.source_currency ?? "").toUpperCase() === src &&
          (!c.dest_currency || !dst || String(c.dest_currency).toUpperCase() === dst) &&
          (!c.dest_country || !country || String(c.dest_country).toUpperCase() === country) &&
          (!c.payment_method || !input.paymentMethod ||
            c.payment_method === "any" || c.payment_method === input.paymentMethod),
      ) ?? null;

    const expectedFee = contractedFee(card, input.amount);
    const expectedFxBps = card?.fx_markup_bps == null ? null : num(card.fx_markup_bps);

    // Drift is measured on total partner cost (fee + FX) so a partner cannot
    // hide an increase by shifting it between the two.
    const observedTotal =
      input.observedFee + (input.amount * num(input.observedFxBps)) / 10_000;
    const expectedTotal =
      expectedFee == null
        ? null
        : expectedFee + (input.amount * num(expectedFxBps)) / 10_000;
    const drift =
      expectedTotal == null || expectedTotal <= 0
        ? null
        : Math.round(((observedTotal - expectedTotal) / expectedTotal) * 10000) / 100;

    await supabase.from("partner_observed_costs").upsert(
      {
        partner_id: partner.id,
        transfer_id: input.transferId ?? null,
        direction,
        source_currency: src,
        dest_currency: dst,
        dest_country: country,
        payment_method: input.paymentMethod ?? null,
        amount: input.amount,
        observed_fee: Math.round(input.observedFee * 100) / 100,
        observed_fx_bps: input.observedFxBps ?? null,
        contracted_fee: expectedFee,
        contracted_fx_bps: expectedFxBps,
        drift_percent: drift,
        fee_currency: (input.feeCurrency ?? src).toUpperCase(),
        provider_reference: input.providerReference ?? null,
        observed_at: new Date().toISOString(),
      },
      { onConflict: "partner_id,provider_reference", ignoreDuplicates: false },
    );

    return drift;
  } catch (e) {
    console.error("[observedPartnerCost] capture failed", e);
    return null;
  }
}
