// Routing engine math: partner cost, eFinMoney revenue, expected profit and scoring.
// Pure functions — no I/O, so they can be unit-reasoned and reused by the
// quote API, the shadow observer and the live dispatcher.

export interface PartnerPricingRow {
  fee_type?: string | null;
  fixed_fee?: number | null;
  percentage_fee?: number | null;
  min_fee?: number | null;
  max_fee?: number | null;
  tiers?: Array<{ min?: number; max?: number; fixed_fee?: number; percentage_fee?: number }> | null;
  fx_markup_bps?: number | null;
  settlement_fee?: number | null;
  network_fee?: number | null;
  compliance_fee?: number | null;
}

export interface CustomerPricingRow {
  fixed_fee?: number | null;
  percentage_fee?: number | null;
  min_fee?: number | null;
  max_fee?: number | null;
  fx_markup_bps?: number | null;
}

export interface RoutingWeights {
  weight_profit: number;
  weight_success: number;
  weight_fx: number;
  weight_speed: number;
  weight_risk: number;
  min_success_rate?: number | null;
  max_retries?: number | null;
}

export interface CandidateInput {
  partner_id: string;
  partner_code: string;
  partner_name: string;
  function_slug: string | null;
  est_minutes: number | null;
  reliability_score: number;
  compliance_risk: string;
  success_rate: number | null;
  fx_spread_bps: number | null;
  available_liquidity: number | null;
  pricing: PartnerPricingRow | null;
  priority: number;
}

export interface ScoredCandidate extends CandidateInput {
  partner_cost: number;
  fx_cost: number;
  total_cost: number;
  customer_revenue: number;
  expected_profit: number;
  margin_percent: number;
  score: number;
  pricing_missing: boolean;
  breakdown: Record<string, number>;
  /** Profit as a percentage of the transaction amount (guardrail basis). */
  volume_margin_percent?: number;
  margin_floor_percent?: number | null;
  margin_floor_action?: "warn" | "uplift" | "block" | null;
  margin_floor_breached?: boolean;
  margin_blocked?: boolean;
  revenue_uplift?: number;
  /** Phase 12 — realised performance score (0..100) and its ranking effect. */
  performance_score?: number | null;
  performance_grade?: string | null;
  performance_penalty?: number;
  performance_blocked?: boolean;
}

export interface PartnerScoreGuard {
  enabled: boolean;
  min_score_to_route: number;
  below_threshold_action: "warn" | "deprioritise" | "block";
  /** Maximum share of the ranking score the performance modifier may move. */
  max_score_influence: number;
}


export interface MarginFloor {
  id?: string | null;
  scope?: string | null;
  min_margin_percent: number;
  action: "warn" | "uplift" | "block";
}


const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Fee for a pricing row given the amount, honouring tiers, min and max. */
export function computeFee(
  pricing: PartnerPricingRow | CustomerPricingRow | null | undefined,
  amount: number,
): number {
  if (!pricing) return 0;
  let fixed = num((pricing as PartnerPricingRow).fixed_fee);
  let pct = num((pricing as PartnerPricingRow).percentage_fee);

  const tiers = (pricing as PartnerPricingRow).tiers;
  if (Array.isArray(tiers) && tiers.length) {
    const tier = tiers.find(
      (t) => amount >= num(t?.min, 0) && (t?.max == null || amount <= num(t.max, Infinity)),
    );
    if (tier) {
      fixed = num(tier.fixed_fee, fixed);
      pct = num(tier.percentage_fee, pct);
    }
  }

  let fee = fixed + (amount * pct) / 100;
  const min = (pricing as PartnerPricingRow).min_fee;
  const max = (pricing as PartnerPricingRow).max_fee;
  if (min != null && fee < num(min)) fee = num(min);
  if (max != null && fee > num(max)) fee = num(max);
  return Math.round(fee * 100) / 100;
}

/** Full partner-side cost of moving `amount` through this candidate. */
export function computePartnerCost(pricing: PartnerPricingRow | null, amount: number) {
  const fee = computeFee(pricing, amount);
  const fxCost = (amount * num(pricing?.fx_markup_bps)) / 10_000;
  const settlement = num(pricing?.settlement_fee);
  const network = num(pricing?.network_fee);
  const compliance = num(pricing?.compliance_fee);
  const total = fee + fxCost + settlement + network + compliance;
  return {
    fee,
    fxCost: Math.round(fxCost * 100) / 100,
    settlement,
    network,
    compliance,
    total: Math.round(total * 100) / 100,
  };
}

/** Revenue eFinMoney charges the customer for this amount. */
export function computeCustomerRevenue(pricing: CustomerPricingRow | null, amount: number) {
  const fee = computeFee(pricing, amount);
  const fx = (amount * num(pricing?.fx_markup_bps)) / 10_000;
  return {
    fee,
    fx: Math.round(fx * 100) / 100,
    total: Math.round((fee + fx) * 100) / 100,
  };
}

const RISK_PENALTY: Record<string, number> = {
  low: 0,
  medium: 0.15,
  high: 0.4,
  critical: 0.8,
};

/**
 * Score a candidate 0..1 using the active rule's weights.
 * Profit is normalised against the best profit in the candidate set.
 */
export function scoreCandidates(
  candidates: CandidateInput[],
  weights: RoutingWeights,
  amount: number,
  customerPricing: CustomerPricingRow | null,
): ScoredCandidate[] {
  const revenue = computeCustomerRevenue(customerPricing, amount);

  const priced = candidates.map((c) => {
    const cost = computePartnerCost(c.pricing, amount);
    const profit = Math.round((revenue.total - cost.total) * 100) / 100;
    return { c, cost, profit };
  });

  const maxProfit = Math.max(...priced.map((p) => p.profit), 0.01);
  const minProfit = Math.min(...priced.map((p) => p.profit), 0);
  const profitRange = Math.max(maxProfit - minProfit, 0.01);

  const maxMinutes = Math.max(...priced.map((p) => num(p.c.est_minutes, 60)), 1);
  const maxSpread = Math.max(...priced.map((p) => Math.abs(num(p.c.fx_spread_bps))), 1);

  const totalWeight =
    num(weights.weight_profit) +
    num(weights.weight_success) +
    num(weights.weight_fx) +
    num(weights.weight_speed) +
    num(weights.weight_risk) || 1;

  return priced
    .map(({ c, cost, profit }) => {
      const profitScore = clamp((profit - minProfit) / profitRange);
      const successScore = clamp(num(c.success_rate, c.reliability_score) / 100);
      const fxScore = clamp(1 - Math.abs(num(c.fx_spread_bps)) / maxSpread);
      const speedScore = clamp(1 - num(c.est_minutes, 60) / maxMinutes);
      const riskScore = clamp(
        (num(c.reliability_score, 100) / 100) - (RISK_PENALTY[c.compliance_risk] ?? 0.2),
      );

      const score =
        (num(weights.weight_profit) * profitScore +
          num(weights.weight_success) * successScore +
          num(weights.weight_fx) * fxScore +
          num(weights.weight_speed) * speedScore +
          num(weights.weight_risk) * riskScore) /
        totalWeight;

      return {
        ...c,
        partner_cost: cost.fee,
        fx_cost: cost.fxCost,
        total_cost: cost.total,
        customer_revenue: revenue.total,
        expected_profit: profit,
        margin_percent: revenue.total > 0 ? Math.round((profit / revenue.total) * 10000) / 100 : 0,
        volume_margin_percent: amount > 0 ? Math.round((profit / amount) * 10000) / 100 : 0,
        score: Math.round(score * 10000) / 10000,

        pricing_missing: !c.pricing,
        breakdown: {
          profitScore: Math.round(profitScore * 1000) / 1000,
          successScore: Math.round(successScore * 1000) / 1000,
          fxScore: Math.round(fxScore * 1000) / 1000,
          speedScore: Math.round(speedScore * 1000) / 1000,
          riskScore: Math.round(riskScore * 1000) / 1000,
          settlement_cost: cost.settlement,
          network_cost: cost.network,
          compliance_cost: cost.compliance,
          customer_fee_revenue: revenue.fee,
          customer_fx_revenue: revenue.fx,
        },
      } as ScoredCandidate;
    })
    .sort((a, b) => b.score - a.score || a.priority - b.priority);
}

/**
 * Enforce a margin floor on scored candidates.
 *
 * The floor is expressed as profit over the transaction amount (the same basis
 * the alert scan uses). Actions:
 *  - `warn`   — flag only, ranking untouched.
 *  - `uplift` — raise the customer revenue by the shortfall so the route clears
 *               the floor, and record the uplift.
 *  - `block`  — mark the candidate blocked so the resolver can drop it and fail
 *               over to the next partner.
 */
export function applyMarginFloor(
  candidates: ScoredCandidate[],
  amount: number,
  floor: MarginFloor | null,
): { candidates: ScoredCandidate[]; blocked: ScoredCandidate[] } {
  if (!floor || !(amount > 0) || !Number.isFinite(num(floor.min_margin_percent))) {
    return { candidates, blocked: [] };
  }

  const minMargin = num(floor.min_margin_percent);
  const action = floor.action ?? "warn";
  const required = (amount * minMargin) / 100;
  const blocked: ScoredCandidate[] = [];

  const out = candidates.map((c) => {
    const profit = num(c.expected_profit);
    const breached = profit < required;
    const base: ScoredCandidate = {
      ...c,
      margin_floor_percent: minMargin,
      margin_floor_action: action,
      margin_floor_breached: breached,
      margin_blocked: false,
      revenue_uplift: 0,
    };
    if (!breached) return base;

    if (action === "uplift") {
      const uplift = Math.round((required - profit) * 100) / 100;
      const revenue = Math.round((num(c.customer_revenue) + uplift) * 100) / 100;
      const newProfit = Math.round((revenue - num(c.total_cost)) * 100) / 100;
      return {
        ...base,
        customer_revenue: revenue,
        expected_profit: newProfit,
        margin_percent: revenue > 0 ? Math.round((newProfit / revenue) * 10000) / 100 : 0,
        volume_margin_percent: Math.round((newProfit / amount) * 10000) / 100,
        revenue_uplift: uplift,
      };
    }

    if (action === "block") {
      const b = { ...base, margin_blocked: true };
      blocked.push(b);
      return b;
    }

    return base;
  });

  if (action !== "block") return { candidates: out, blocked: [] };
  return { candidates: out.filter((c) => !c.margin_blocked), blocked };
}

/**
 * Phase 12 — shade the ranking with realised partner performance.
 *
 * Applied AFTER the margin floor so guardrails stay authoritative: the score
 * can only move the ranking value by `max_score_influence`, never enough to
 * resurrect a margin-blocked candidate. Partners without a confident score are
 * untouched (score `null` → neutral).
 */
export function applyPartnerScores(
  candidates: ScoredCandidate[],
  scores: Map<string, { score: number; grade: string }>,
  guard: PartnerScoreGuard | null,
): { candidates: ScoredCandidate[]; blocked: ScoredCandidate[] } {
  if (!guard || !guard.enabled) return { candidates, blocked: [] };

  const influence = clamp(num(guard.max_score_influence, 0.15), 0, 1);
  const threshold = num(guard.min_score_to_route, 0);
  const action = guard.below_threshold_action ?? "warn";
  const blocked: ScoredCandidate[] = [];

  const out = candidates.map((c) => {
    const hit = scores.get(c.partner_id) ?? null;
    if (!hit) {
      return { ...c, performance_score: null, performance_grade: null, performance_penalty: 0, performance_blocked: false };
    }

    // 0..1 where 1 = perfect score; deviation from 100 costs ranking points.
    const normalised = clamp(hit.score / 100);
    const delta = Math.round((influence * (normalised - 1)) * 10000) / 10000; // <= 0
    const below = hit.score < threshold;

    const base: ScoredCandidate = {
      ...c,
      performance_score: hit.score,
      performance_grade: hit.grade,
      performance_penalty: Math.abs(delta),
      performance_blocked: false,
      score: Math.max(0, Math.round((num(c.score) + delta) * 10000) / 10000),
      breakdown: { ...c.breakdown, performanceScore: normalised, performancePenalty: Math.abs(delta) },
    };

    if (!below) return base;

    if (action === "block") {
      const b = { ...base, performance_blocked: true };
      blocked.push(b);
      return b;
    }

    if (action === "deprioritise") {
      // push below every scoring partner, but keep it as a failover option
      return { ...base, score: Math.max(0, Math.round(base.score * 0.5 * 10000) / 10000) };
    }

    return base;
  });

  const kept = out.filter((c) => !c.performance_blocked)
    .sort((a, b) => b.score - a.score || a.priority - b.priority);
  return { candidates: kept, blocked };
}


