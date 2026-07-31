// Phase 13 — incident-driven partner suspension.
// Hourly scan: suspends partners/corridors breaching failure-rate, critical-alert
// or scorecard thresholds, and auto-restores once the trigger clears + cooldown.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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

interface Settings {
  enabled: boolean;
  auto_restore: boolean;
  cooldown_minutes: number;
  lookback_minutes: number;
  min_attempts: number;
  max_failure_rate_percent: number;
  critical_alert_count: number;
  min_score_to_operate: number;
  suspend_scope: string;
}

const DEFAULTS: Settings = {
  enabled: true,
  auto_restore: true,
  cooldown_minutes: 60,
  lookback_minutes: 180,
  min_attempts: 10,
  max_failure_rate_percent: 40,
  critical_alert_count: 3,
  min_score_to_operate: 40,
  suspend_scope: "corridor",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (token) {
      const { data: userData } = await supabase.auth.getUser(token);
      const user = userData?.user;
      if (user) {
        const { data: isManager } = await supabase.rpc("is_pricing_manager", { _uid: user.id });
        if (!isManager) return json({ success: false, error: "Forbidden" }, 403);
      }
    }

    const { data: cfgRow } = await supabase.from("incident_settings").select("*").maybeSingle();
    const settings: Settings = { ...DEFAULTS, ...(cfgRow ?? {}) } as Settings;

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    // ---------- 1. auto-restore first, so a recovered partner can be re-suspended cleanly ----------
    let restored = 0;
    const { data: active } = await supabase
      .from("partner_suspensions")
      .select("*")
      .eq("status", "active");

    // ---------- 2. gather current signals ----------
    const since = new Date(nowMs - settings.lookback_minutes * 60_000).toISOString();

    const { data: attempts } = await supabase
      .from("routing_attempts")
      .select("partner_id, partner_code, outcome, created_at")
      .gte("created_at", since)
      .limit(10000);

    const stats = new Map<string, { total: number; failed: number; code: string }>();
    for (const a of attempts ?? []) {
      if (!a.partner_id) continue;
      const s = stats.get(a.partner_id) ?? { total: 0, failed: 0, code: a.partner_code ?? "" };
      s.total += 1;
      if (a.outcome && a.outcome !== "success") s.failed += 1;
      stats.set(a.partner_id, s);
    }

    const { data: criticalAlerts } = await supabase
      .from("partner_alerts")
      .select("partner_id, corridor_key, severity, status, occurrences, last_seen_at")
      .eq("severity", "critical")
      .in("status", ["open", "acknowledged"])
      .gte("last_seen_at", since);

    const alertCount = new Map<string, number>();
    for (const a of criticalAlerts ?? []) {
      if (!a.partner_id) continue;
      alertCount.set(a.partner_id, (alertCount.get(a.partner_id) ?? 0) + num(a.occurrences, 1));
    }

    const { data: cards } = await supabase
      .from("partner_scorecards")
      .select("partner_id, corridor_key, composite_score, grade, confident")
      .eq("confident", true);

    const worstScore = new Map<string, { score: number; corridor: string; grade: string }>();
    for (const c of cards ?? []) {
      const score = num(c.composite_score);
      const prev = worstScore.get(c.partner_id);
      if (!prev || score < prev.score) {
        worstScore.set(c.partner_id, { score, corridor: c.corridor_key, grade: c.grade });
      }
    }

    // helper: does the trigger still hold for this partner?
    const triggerStillActive = (partnerId: string): boolean => {
      const s = stats.get(partnerId);
      if (
        s && s.total >= settings.min_attempts &&
        (s.failed / s.total) * 100 >= settings.max_failure_rate_percent
      ) return true;
      if ((alertCount.get(partnerId) ?? 0) >= settings.critical_alert_count) return true;
      const w = worstScore.get(partnerId);
      if (w && w.score < settings.min_score_to_operate) return true;
      return false;
    };

    for (const s of active ?? []) {
      if (!s.auto_restore || !settings.auto_restore) continue;
      const until = s.suspended_until ? new Date(s.suspended_until).getTime() : 0;
      const cooldownDone = until ? nowMs >= until : true;
      if (!cooldownDone) continue;
      if (s.trigger_source !== "manual" && triggerStillActive(s.partner_id)) continue;
      if (s.trigger_source === "manual") continue; // manual suspensions need a manual lift

      await supabase
        .from("partner_suspensions")
        .update({
          status: "lifted",
          lifted_at: nowIso,
          lift_reason: "Trigger cleared and cooldown elapsed — auto-restored",
        })
        .eq("id", s.id);
      restored += 1;
    }

    if (!settings.enabled) {
      return json({ success: true, skipped: true, restored, reason: "Auto-suspension disabled" });
    }

    // ---------- 3. evaluate new suspensions ----------
    const { data: stillActive } = await supabase
      .from("partner_suspensions")
      .select("partner_id, corridor_key, scope")
      .eq("status", "active");
    const activeKeys = new Set(
      (stillActive ?? []).map((s: any) => `${s.partner_id}|${s.corridor_key ?? "*"}`),
    );

    const suspensions: Record<string, unknown>[] = [];

    const push = (
      partnerId: string,
      corridorKeyValue: string | null,
      reason: string,
      metrics: Record<string, unknown>,
    ) => {
      const scope = corridorKeyValue ? "corridor" : "partner";
      const k = `${partnerId}|${corridorKeyValue ?? "*"}`;
      const globalKey = `${partnerId}|*`;
      if (activeKeys.has(k) || activeKeys.has(globalKey)) return;
      activeKeys.add(k);
      suspensions.push({
        partner_id: partnerId,
        corridor_key: corridorKeyValue,
        scope,
        reason,
        trigger_source: metrics.trigger_source ?? "alert",
        trigger_metrics: metrics,
        status: "active",
        auto_restore: settings.auto_restore,
        cooldown_minutes: settings.cooldown_minutes,
        suspended_from: nowIso,
        suspended_until: new Date(nowMs + settings.cooldown_minutes * 60_000).toISOString(),
      });
    };

    for (const [partnerId, s] of stats) {
      if (s.total < settings.min_attempts) continue;
      const rate = r2((s.failed / s.total) * 100);
      if (rate >= settings.max_failure_rate_percent) {
        push(partnerId, null, `Failure rate ${rate}% over the last ${settings.lookback_minutes} minutes`, {
          trigger_source: "alert",
          failure_rate_percent: rate,
          attempts: s.total,
          failures: s.failed,
        });
      }
    }

    for (const [partnerId, count] of alertCount) {
      if (count >= settings.critical_alert_count) {
        push(partnerId, null, `${count} critical alert occurrence(s) in the incident window`, {
          trigger_source: "alert",
          critical_alerts: count,
        });
      }
    }

    for (const [partnerId, w] of worstScore) {
      if (w.score < settings.min_score_to_operate) {
        const scoped = settings.suspend_scope === "corridor" ? w.corridor : null;
        push(partnerId, scoped, `Performance score ${w.score} (grade ${w.grade}) below operating floor`, {
          trigger_source: "scorecard",
          composite_score: w.score,
          grade: w.grade,
          corridor_key: w.corridor,
        });
      }
    }

    let created = 0;
    if (suspensions.length) {
      const { data: ins, error } = await supabase
        .from("partner_suspensions")
        .insert(suspensions)
        .select("id, partner_id, reason, corridor_key");
      if (error) console.error("suspension insert failed", error.message);
      created = ins?.length ?? 0;

      for (const row of ins ?? []) {
        await supabase.from("audit_logs").insert({
          action: "partner_suspended",
          table_name: "partner_suspensions",
          record_id: row.id,
          new_data: {
            partner_id: row.partner_id,
            reason: row.reason,
            corridor_key: row.corridor_key,
          },
        });
      }
    }

    return json({
      success: true,
      evaluated_partners: stats.size,
      suspended: created,
      restored,
      auto_restore: settings.auto_restore,
    });
  } catch (e) {
    console.error("partner-incident-scan failed", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
