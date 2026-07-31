// Phase 12 — partner scorecard scan.
// Aggregates realised routing/settlement/cost data per partner and corridor,
// writes partner_scorecards, and raises a partner_score alert when a partner
// drops a grade or falls below the routing threshold.
// Runs daily by cron (service role) or on demand by a pricing manager.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  corridorKey,
  DEFAULT_SCORE_WEIGHTS,
  percentile,
  ScoreWeights,
  scoreCard,
} from "../_shared/partnerScorecards.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

interface Bucket {
  partner_id: string;
  corridor_key: string;
  source_currency: string | null;
  dest_currency: string | null;
  dest_country: string | null;
  payment_method: string | null;
  direction: string;
  attempts: number;
  success: number;
  failure: number;
  latencies: number[];
  realisedMargins: number[];
  modelledMargins: number[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // Manual runs must come from a pricing manager; cron runs carry no user.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (token) {
      const { data: userData } = await supabase.auth.getUser(token);
      const user = userData?.user;
      if (user) {
        const { data: isManager } = await supabase.rpc("is_pricing_manager", { _uid: user.id });
        if (!isManager) return json({ success: false, error: "Forbidden" }, 403);
      }
    }

    const { data: cfg } = await supabase
      .from("partner_score_weights")
      .select("*")
      .maybeSingle();
    const weights: ScoreWeights = { ...DEFAULT_SCORE_WEIGHTS, ...(cfg ?? {}) } as ScoreWeights;
    weights.lookback_days = num(weights.lookback_days, 30);
    weights.min_attempts = num(weights.min_attempts, 20);

    const to = new Date();
    const from = new Date(to.getTime() - weights.lookback_days * 86_400_000);
    const fromIso = from.toISOString();

    // ------------------------------------------------ routing attempts
    const { data: decisions } = await supabase
      .from("routing_decisions")
      .select("id, direction, source_currency, dest_currency, dest_country, payment_method")
      .gte("created_at", fromIso)
      .limit(20000);

    const decisionMap = new Map<string, any>();
    for (const d of decisions ?? []) decisionMap.set(d.id, d);

    const { data: attempts } = await supabase
      .from("routing_attempts")
      .select("partner_id, routing_decision_id, outcome, latency_ms, created_at")
      .gte("created_at", fromIso)
      .limit(50000);

    const buckets = new Map<string, Bucket>();
    const bucketFor = (partnerId: string, d: any): Bucket => {
      const key = corridorKey(d?.source_currency, d?.dest_currency, d?.dest_country, d?.payment_method);
      const id = `${partnerId}|${key}`;
      let b = buckets.get(id);
      if (!b) {
        b = {
          partner_id: partnerId,
          corridor_key: key,
          source_currency: d?.source_currency ?? null,
          dest_currency: d?.dest_currency ?? null,
          dest_country: d?.dest_country ?? null,
          payment_method: d?.payment_method ?? null,
          direction: d?.direction ?? "payout",
          attempts: 0,
          success: 0,
          failure: 0,
          latencies: [],
          realisedMargins: [],
          modelledMargins: [],
        };
        buckets.set(id, b);
      }
      return b;
    };

    for (const a of attempts ?? []) {
      if (!a.partner_id) continue;
      const d = decisionMap.get(a.routing_decision_id);
      const b = bucketFor(a.partner_id, d);
      b.attempts += 1;
      if (a.outcome === "success" || a.outcome === "completed") b.success += 1;
      else b.failure += 1;
      const ms = num(a.latency_ms, 0);
      if (ms > 0) b.latencies.push(ms / 60000);
    }

    // ------------------------------------------------ realised economics
    const { data: econ } = await supabase
      .from("transaction_economics")
      .select(
        "partner_id, direction, source_currency, dest_currency, dest_country, payment_method, margin_percent, economics_source",
      )
      .gte("created_at", fromIso)
      .limit(50000);

    for (const e of econ ?? []) {
      if (!e.partner_id) continue;
      const b = bucketFor(e.partner_id, e);
      const m = num(e.margin_percent);
      if (e.economics_source === "modelled") b.modelledMargins.push(m);
      else b.realisedMargins.push(m);
    }

    // ------------------------------------------------ partner-level signals
    const { data: invoices } = await supabase
      .from("partner_invoices")
      .select("id, partner_id")
      .gte("created_at", fromIso)
      .limit(5000);
    const invoicePartner = new Map<string, string>();
    for (const i of invoices ?? []) invoicePartner.set(i.id, i.partner_id);

    const { data: lines } = await supabase
      .from("partner_invoice_lines")
      .select("invoice_id, billed_fee, expected_fee, variance, dispute_status")
      .in("invoice_id", Array.from(invoicePartner.keys()).slice(0, 500))
      .limit(20000);

    const costByPartner = new Map<string, { billed: number; expected: number; disputes: number; lines: number }>();
    for (const l of lines ?? []) {
      const pid = invoicePartner.get(l.invoice_id);
      if (!pid) continue;
      const agg = costByPartner.get(pid) ?? { billed: 0, expected: 0, disputes: 0, lines: 0 };
      agg.billed += num(l.billed_fee);
      agg.expected += num(l.expected_fee);
      agg.lines += 1;
      if (l.dispute_status && l.dispute_status !== "none") agg.disputes += 1;
      costByPartner.set(pid, agg);
    }

    const { data: liqAlerts } = await supabase
      .from("partner_alerts")
      .select("partner_id, alert_type")
      .gte("created_at", fromIso)
      .limit(5000);
    const liquidityByPartner = new Map<string, number>();
    for (const a of liqAlerts ?? []) {
      if (!a.partner_id || !String(a.alert_type ?? "").includes("liquidity")) continue;
      liquidityByPartner.set(a.partner_id, (liquidityByPartner.get(a.partner_id) ?? 0) + 1);
    }

    const { data: partners } = await supabase.from("payment_partners").select("id, code, name");
    const partnerName = new Map<string, string>();
    for (const p of partners ?? []) partnerName.set(p.id, p.name ?? p.code ?? p.id);

    // ------------------------------------------------ existing (for trend)
    const { data: prior } = await supabase
      .from("partner_scorecards")
      .select("partner_id, corridor_key, composite_score, grade");
    const priorMap = new Map<string, { score: number; grade: string }>();
    for (const p of prior ?? []) {
      priorMap.set(`${p.partner_id}|${p.corridor_key}`, {
        score: num(p.composite_score),
        grade: p.grade,
      });
    }

    const findings: Array<{ partner: string; corridor: string; score: number; grade: string; prev: string | null }> = [];
    let written = 0;

    for (const b of buckets.values()) {
      const cost = costByPartner.get(b.partner_id);
      const costVariance = cost && cost.expected > 0
        ? ((cost.billed - cost.expected) / cost.expected) * 100
        : 0;
      const disputeRate = cost && cost.lines > 0 ? (cost.disputes / cost.lines) * 100 : 0;

      const avgMinutes = b.latencies.length
        ? b.latencies.reduce((s, v) => s + v, 0) / b.latencies.length
        : null;
      const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

      const card = scoreCard(
        {
          attempt_count: b.attempts,
          success_count: b.success,
          failure_count: b.failure,
          success_rate: b.attempts > 0 ? (b.success / b.attempts) * 100 : 0,
          avg_settlement_minutes: avgMinutes,
          p95_settlement_minutes: percentile(b.latencies, 95),
          dispute_count: cost?.disputes ?? 0,
          dispute_rate: disputeRate,
          cost_variance_percent: costVariance,
          realised_margin_percent: avg(b.realisedMargins),
          modelled_margin_percent: avg(b.modelledMargins),
          liquidity_incidents: liquidityByPartner.get(b.partner_id) ?? 0,
        },
        weights,
      );

      const prev = priorMap.get(`${b.partner_id}|${b.corridor_key}`) ?? null;

      const row = {
        partner_id: b.partner_id,
        corridor_key: b.corridor_key,
        corridor_label: `${b.source_currency ?? "?"} → ${b.dest_currency ?? "?"}${
          b.dest_country ? ` (${b.dest_country})` : ""
        }${b.payment_method ? ` · ${b.payment_method}` : ""}`,
        direction: b.direction,
        source_currency: b.source_currency,
        dest_currency: b.dest_currency,
        dest_country: b.dest_country,
        payment_method: b.payment_method,
        window_days: weights.lookback_days,
        period_start: from.toISOString(),
        period_end: to.toISOString(),
        ...card,
        avg_settlement_minutes: card.avg_settlement_minutes,
        previous_score: prev?.score ?? null,
        previous_grade: prev?.grade ?? null,
        computed_at: to.toISOString(),
      };

      const { error } = await supabase
        .from("partner_scorecards")
        .upsert(row, { onConflict: "partner_id,corridor_key" });
      if (error) {
        console.error("scorecard upsert failed", b.corridor_key, error.message);
        continue;
      }
      written += 1;

      const droppedGrade = prev && prev.grade !== "N/A" && card.grade !== "N/A" &&
        card.grade > prev.grade; // letters sort A<B<C<D<F, so ">" means worse
      const belowThreshold = card.confident && card.composite_score < weights.min_score_to_route;
      if (droppedGrade || belowThreshold) {
        findings.push({
          partner: partnerName.get(b.partner_id) ?? b.partner_id,
          corridor: b.corridor_key,
          score: card.composite_score,
          grade: card.grade,
          prev: prev?.grade ?? null,
        });
      }
    }

    if (findings.length) {
      const worst = findings.slice(0, 10);
      await supabase.from("partner_alerts").upsert(
        {
          fingerprint: "partner_score:degraded",
          alert_type: "partner_score",
          severity: "warning",
          title: `${findings.length} partner corridor(s) below performance expectations`,
          message: worst
            .map((f) =>
              `${f.partner} · ${f.corridor}: score ${f.score} (grade ${f.grade}${
                f.prev ? `, was ${f.prev}` : ""
              })`
            )
            .join("\n"),
          metrics: { count: findings.length, worst },
          status: "open",
        },
        { onConflict: "fingerprint" },
      );
    }

    return json({
      success: true,
      scorecards: written,
      corridors: buckets.size,
      flagged: findings.length,
      enabled: weights.enabled,
      window_days: weights.lookback_days,
    });
  } catch (e) {
    console.error("partner-scorecard-scan failed", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
