// Phase 12 — partner scorecard maths.
// Pure functions: turn raw per-corridor metrics into 0..100 dimension scores,
// a weighted composite and a letter grade. No I/O so the routing engine, the
// cron scan and the simulator can all share the same definition of "good".

export interface ScoreWeights {
  enabled: boolean;
  lookback_days: number;
  min_attempts: number;
  weight_success: number;
  weight_speed: number;
  weight_dispute: number;
  weight_cost_variance: number;
  weight_margin: number;
  weight_liquidity: number;
  min_score_to_route: number;
  below_threshold_action: "warn" | "deprioritise" | "block";
  max_score_influence: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  enabled: false,
  lookback_days: 30,
  min_attempts: 20,
  weight_success: 35,
  weight_speed: 15,
  weight_dispute: 15,
  weight_cost_variance: 15,
  weight_margin: 15,
  weight_liquidity: 5,
  min_score_to_route: 60,
  below_threshold_action: "warn",
  max_score_influence: 0.15,
};

export interface ScorecardMetrics {
  attempt_count: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  avg_settlement_minutes: number | null;
  p95_settlement_minutes: number | null;
  dispute_count: number;
  dispute_rate: number;
  cost_variance_percent: number;
  realised_margin_percent: number;
  modelled_margin_percent: number;
  liquidity_incidents: number;
}

export interface ScoredCard extends ScorecardMetrics {
  margin_gap_percent: number;
  score_success: number;
  score_speed: number;
  score_dispute: number;
  score_cost_variance: number;
  score_margin: number;
  score_liquidity: number;
  composite_score: number;
  grade: string;
  confident: boolean;
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, n));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Target settlement time; anything at or under scores full marks. */
const SPEED_TARGET_MINUTES = 15;
const SPEED_FLOOR_MINUTES = 240;

export function gradeFor(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function scoreCard(m: ScorecardMetrics, w: ScoreWeights): ScoredCard {
  const successScore = clamp100(m.success_rate);

  const speedBasis = m.p95_settlement_minutes ?? m.avg_settlement_minutes;
  const speedScore = speedBasis == null
    ? 70 // unknown speed is neutral-positive, never punitive
    : clamp100(
      100 -
        ((Math.max(0, speedBasis - SPEED_TARGET_MINUTES)) /
          (SPEED_FLOOR_MINUTES - SPEED_TARGET_MINUTES)) * 100,
    );

  // 0% disputes -> 100, 5%+ disputes -> 0
  const disputeScore = clamp100(100 - (m.dispute_rate / 5) * 100);

  // billed cost matching the quote -> 100, 20%+ overbilling -> 0
  const overBill = Math.max(0, m.cost_variance_percent);
  const costScore = clamp100(100 - (overBill / 20) * 100);

  const gap = r2(m.realised_margin_percent - m.modelled_margin_percent);
  // realised margin at or above modelled -> 100, 10pp short -> 0
  const marginScore = clamp100(100 + (Math.min(0, gap) / 10) * 100);

  const liquidityScore = clamp100(100 - m.liquidity_incidents * 20);

  const total =
    w.weight_success + w.weight_speed + w.weight_dispute +
    w.weight_cost_variance + w.weight_margin + w.weight_liquidity;
  const denom = total > 0 ? total : 1;

  const composite = r2(
    (w.weight_success * successScore +
      w.weight_speed * speedScore +
      w.weight_dispute * disputeScore +
      w.weight_cost_variance * costScore +
      w.weight_margin * marginScore +
      w.weight_liquidity * liquidityScore) / denom,
  );

  const confident = m.attempt_count >= w.min_attempts;

  return {
    ...m,
    margin_gap_percent: gap,
    score_success: r2(successScore),
    score_speed: r2(speedScore),
    score_dispute: r2(disputeScore),
    score_cost_variance: r2(costScore),
    score_margin: r2(marginScore),
    score_liquidity: r2(liquidityScore),
    composite_score: composite,
    grade: confident ? gradeFor(composite) : "N/A",
    confident,
  };
}

export interface ScoreLookup {
  /** composite score keyed by `${partner_id}|${corridor_key}` and by partner_id. */
  get(partnerId: string, corridorKey: string): { score: number; grade: string } | null;
}

export function buildScoreLookup(
  rows: Array<{ partner_id: string; corridor_key: string; composite_score: number; grade: string; confident: boolean }>,
): ScoreLookup {
  const exact = new Map<string, { score: number; grade: string }>();
  const byPartner = new Map<string, { sum: number; n: number; grade: string }>();
  for (const r of rows) {
    if (!r.confident) continue;
    const score = Number(r.composite_score) || 0;
    exact.set(`${r.partner_id}|${r.corridor_key}`, { score, grade: r.grade });
    const agg = byPartner.get(r.partner_id) ?? { sum: 0, n: 0, grade: r.grade };
    agg.sum += score;
    agg.n += 1;
    byPartner.set(r.partner_id, agg);
  }
  return {
    get(partnerId, corridorKey) {
      const hit = exact.get(`${partnerId}|${corridorKey}`);
      if (hit) return hit;
      const agg = byPartner.get(partnerId);
      if (!agg || !agg.n) return null;
      const score = r2(agg.sum / agg.n);
      return { score, grade: gradeFor(score) };
    },
  };
}

/** Canonical corridor key used across scorecards and routing. */
export function corridorKey(
  src: string | null | undefined,
  dst: string | null | undefined,
  country?: string | null,
  method?: string | null,
): string {
  return [
    (src ?? "").toUpperCase() || "?",
    (dst ?? "").toUpperCase() || "?",
    (country ?? "").toUpperCase() || "*",
    method ?? "*",
  ].join("|");
}
