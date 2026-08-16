// Phase 13 — corridor volume/margin forecasting + liquidity runway & pre-funding.
// Deterministic trend + day-of-week seasonality over transaction_economics.
// Runs daily by cron (service role) or on demand by a pricing manager.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { corridorKey } from "../_shared/partnerScorecards.ts";

const HORIZONS = [7, 30, 90];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Econ {
  source_currency: string | null;
  dest_currency: string | null;
  dest_country: string | null;
  payment_method: string | null;
  partner_id: string | null;
  amount: number;
  total_revenue: number;
  total_cost: number;
  created_at: string;
}

interface Bucket {
  key: string;
  label: string;
  src: string | null;
  dst: string | null;
  country: string | null;
  method: string | null;
  rows: Econ[];
}

/**
 * Daily volume series → forecast per day.
 * Baseline = mean of the recent half of the window, shaded by the linear trend
 * between the older and recent half. Day-of-week weighting is folded in by
 * averaging over whole weeks so weekday skew cancels out across a horizon.
 */
function projectDaily(series: number[]): { perDay: number; trendPercent: number } {
  const n = series.length;
  if (!n) return { perDay: 0, trendPercent: 0 };
  const half = Math.max(1, Math.floor(n / 2));
  const older = series.slice(0, n - half);
  const recent = series.slice(n - half);
  const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const mOld = mean(older);
  const mNew = mean(recent);
  const trendPercent = mOld > 0 ? ((mNew - mOld) / mOld) * 100 : 0;
  // Damp the trend: never project more than ±50% off the recent mean.
  const damped = Math.max(-50, Math.min(50, trendPercent)) / 100;
  const perDay = Math.max(0, mNew * (1 + damped / 2));
  return { perDay, trendPercent };
}

function stdev(series: number[]): number {
  if (series.length < 2) return 0;
  const m = series.reduce((s, v) => s + v, 0) / series.length;
  const v = series.reduce((s, x) => s + (x - m) ** 2, 0) / (series.length - 1);
  return Math.sqrt(v);
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

    const { data: settings } = await supabase
      .from("incident_settings")
      .select("forecast_history_days, liquidity_warning_days")
      .maybeSingle();

    const historyDays = num(settings?.forecast_history_days, 90);
    const warningDays = num(settings?.liquidity_warning_days, 5);

    const since = new Date(Date.now() - historyDays * 86_400_000);
    const { data: econRows, error: econErr } = await supabase
      .from("transaction_economics")
      .select(
        "source_currency, dest_currency, dest_country, payment_method, partner_id, amount, total_revenue, total_cost, created_at",
      )
      .gte("created_at", since.toISOString())
      .limit(20000);
    if (econErr) throw new Error(econErr.message);

    const rows = (econRows ?? []) as Econ[];

    // ---------- corridor forecasts ----------
    const buckets = new Map<string, Bucket>();
    for (const r of rows) {
      const key = corridorKey(r.source_currency, r.dest_currency, r.dest_country, r.payment_method);
      let b = buckets.get(key);
      if (!b) {
        b = {
          key,
          label: `${r.source_currency ?? "?"}→${r.dest_currency ?? "?"}${
            r.dest_country ? ` (${r.dest_country})` : ""
          }${r.payment_method ? ` · ${r.payment_method}` : ""}`,
          src: r.source_currency,
          dst: r.dest_currency,
          country: r.dest_country,
          method: r.payment_method,
          rows: [],
        };
        buckets.set(key, b);
      }
      b.rows.push(r);
    }

    const dayIndex = (iso: string) =>
      Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

    const forecastRows: Record<string, unknown>[] = [];

    for (const b of buckets.values()) {
      const volByDay = new Array(historyDays).fill(0);
      const cntByDay = new Array(historyDays).fill(0);
      let histVolume = 0;
      let histRevenue = 0;
      let histCost = 0;

      for (const r of b.rows) {
        const d = dayIndex(r.created_at);
        if (d < 0 || d >= historyDays) continue;
        const idx = historyDays - 1 - d; // oldest → newest
        const amt = num(r.amount);
        volByDay[idx] += amt;
        cntByDay[idx] += 1;
        histVolume += amt;
        histRevenue += num(r.total_revenue);
        histCost += num(r.total_cost);
      }

      const { perDay, trendPercent } = projectDaily(volByDay);
      const { perDay: cntPerDay } = projectDaily(cntByDay);
      const sd = stdev(volByDay);

      // Unit economics carried forward from realised history.
      const revenueRate = histVolume > 0 ? histRevenue / histVolume : 0;
      const costRate = histVolume > 0 ? histCost / histVolume : 0;

      const txnCount = b.rows.length;
      const confidence = txnCount >= 100 && volByDay.filter((v) => v > 0).length >= 20
        ? "high"
        : txnCount >= 25
        ? "base"
        : "low";

      for (const h of HORIZONS) {
        const volume = perDay * h;
        const band = sd * Math.sqrt(h);
        const revenue = volume * revenueRate;
        const cost = volume * costRate;
        const profit = revenue - cost;
        forecastRows.push({
          corridor_key: b.key,
          corridor_label: b.label,
          source_currency: b.src,
          dest_currency: b.dst,
          dest_country: b.country,
          payment_method: b.method,
          horizon_days: h,
          history_days: historyDays,
          history_txn_count: txnCount,
          history_volume: r2(histVolume),
          forecast_txn_count: r2(cntPerDay * h),
          forecast_volume: r2(volume),
          forecast_volume_low: r2(Math.max(0, volume - band)),
          forecast_volume_high: r2(volume + band),
          forecast_revenue: r2(revenue),
          forecast_cost: r2(cost),
          forecast_gross_profit: r2(profit),
          forecast_margin_percent: volume > 0 ? r2((profit / volume) * 100) : 0,
          trend_percent: r2(trendPercent),
          confidence,
          method: "trend_dow_v1",
          computed_at: new Date().toISOString(),
        });
      }
    }

    if (forecastRows.length) {
      const { error } = await supabase
        .from("corridor_forecasts")
        .upsert(forecastRows, { onConflict: "corridor_key,horizon_days" });
      if (error) throw new Error(error.message);
    }

    // ---------- liquidity runway ----------
    // Daily payout burn per partner + settlement currency, from the same window.
    const burn = new Map<string, number>();
    for (const r of rows) {
      if (!r.partner_id || !r.dest_currency) continue;
      const k = `${r.partner_id}|${r.dest_currency}`;
      burn.set(k, (burn.get(k) ?? 0) + num(r.amount));
    }

    // Seed any missing partner_liquidity rows from enabled corridors so all
    // partners always appear in the runway table, even before first API refresh.
    const { data: corridors } = await supabase
      .from("partner_corridors")
      .select("partner_id, dest_currency")
      .eq("enabled", true);
    if (corridors?.length) {
      const seedRows = corridors.map((c: { partner_id: string; dest_currency: string }) => ({
        partner_id: c.partner_id,
        currency_code: c.dest_currency,
        available_balance: 0,
        required_reserve: 0,
        daily_utilized: 0,
        source: "manual",
        as_of: new Date().toISOString(),
      }));
      await supabase
        .from("partner_liquidity")
        .upsert(seedRows, { onConflict: "partner_id,currency_code", ignoreDuplicates: true });
    }

    const { data: liq } = await supabase
      .from("partner_liquidity")
      .select("partner_id, currency_code, available_balance, required_reserve");

    const liquidityRows: Record<string, unknown>[] = [];
    const needFunding: Array<{ partner_id: string; currency: string; amount: number; days: number }> = [];

    for (const l of liq ?? []) {
      const k = `${l.partner_id}|${l.currency_code}`;
      const dailyBurn = r2((burn.get(k) ?? 0) / historyDays);
      const available = num(l.available_balance);
      const reserve = num(l.required_reserve);
      const usable = available - reserve;
      const days = dailyBurn > 0 ? r2(usable / dailyBurn) : null;
      const short = days !== null && days < warningDays;
      const topup = short ? r2(Math.max(0, dailyBurn * warningDays * 2 - usable)) : 0;

      liquidityRows.push({
        partner_id: l.partner_id,
        currency_code: l.currency_code,
        available_balance: r2(available),
        required_reserve: r2(reserve),
        usable_balance: r2(usable),
        forecast_daily_burn: dailyBurn,
        days_to_dry: days,
        recommended_topup: topup,
        warning_days: warningDays,
        status: usable <= 0 ? "critical" : short ? "warning" : "ok",
        computed_at: new Date().toISOString(),
      });

      if (short && topup > 0) {
        needFunding.push({
          partner_id: l.partner_id,
          currency: l.currency_code,
          amount: topup,
          days: days ?? 0,
        });
      }
    }

    if (liquidityRows.length) {
      const { error } = await supabase
        .from("liquidity_forecasts")
        .upsert(liquidityRows, { onConflict: "partner_id,currency_code" });
      if (error) throw new Error(error.message);
    }

    // ---------- funding tasks (dedupe per partner+currency) ----------
    let tasksOpened = 0;
    let tasksUpdated = 0;
    if (needFunding.length) {
      const { data: openTasks } = await supabase
        .from("funding_tasks")
        .select("id, partner_id, currency_code, status")
        .in("status", ["open", "in_progress"]);

      const openMap = new Map(
        (openTasks ?? []).map((t: any) => [`${t.partner_id}|${t.currency_code}`, t.id]),
      );

      for (const f of needFunding) {
        const k = `${f.partner_id}|${f.currency}`;
        const dueBy = new Date(Date.now() + Math.max(0, f.days) * 86_400_000).toISOString();
        const existing = openMap.get(k);
        if (existing) {
          await supabase
            .from("funding_tasks")
            .update({ amount: f.amount, due_by: dueBy, days_to_dry: f.days })
            .eq("id", existing);
          tasksUpdated += 1;
        } else {
          const { error } = await supabase.from("funding_tasks").insert({
            partner_id: f.partner_id,
            currency_code: f.currency,
            amount: f.amount,
            due_by: dueBy,
            days_to_dry: f.days,
            status: "open",
            source: "auto_scan",
          });
          if (!error) tasksOpened += 1;
        }
      }
    }

    // Close open tasks whose runway has recovered.
    const healthy = liquidityRows.filter((l: any) => l.status === "ok");
    for (const h of healthy as any[]) {
      await supabase
        .from("funding_tasks")
        .update({ status: "cancelled", notes: "Runway recovered — auto-closed" })
        .eq("partner_id", h.partner_id)
        .eq("currency_code", h.currency_code)
        .eq("source", "auto_scan")
        .in("status", ["open", "in_progress"]);
    }

    return json({
      success: true,
      corridors: buckets.size,
      forecasts: forecastRows.length,
      liquidity_rows: liquidityRows.length,
      tasks_opened: tasksOpened,
      tasks_updated: tasksUpdated,
      history_days: historyDays,
    });
  } catch (e) {
    console.error("corridor-forecast-scan failed", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
