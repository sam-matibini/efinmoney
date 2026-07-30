// Hourly partner network alert scan: margin floors, negative-profit traffic,
// pricing coverage gaps, corridor readiness and liquidity headroom.
// Findings are de-duplicated into public.partner_alerts by fingerprint.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Finding {
  fingerprint: string;
  alert_type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  partner_id?: string | null;
  corridor_key?: string | null;
  metrics?: Record<string, unknown>;
}

const DEFAULTS: Record<string, number> = {
  partner_alert_min_margin_percent: 1.5,
  partner_alert_min_volume: 500,
  partner_alert_gap_volume: 250,
  partner_alert_window_days: 30,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // ---------------------------------------------------------------- config
    const cfg = { ...DEFAULTS };
    const { data: cfgRows } = await supabase
      .from("pricing_config")
      .select("key, value")
      .in("key", Object.keys(DEFAULTS));
    for (const r of cfgRows ?? []) {
      const v = Number((r as { value: number }).value);
      if (Number.isFinite(v)) cfg[(r as { key: string }).key] = v;
    }

    const windowDays = Math.max(1, cfg.partner_alert_window_days);
    const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
    const findings: Finding[] = [];

    const { data: partners } = await supabase
      .from("payment_partners")
      .select("id, code, name, status");
    const partnerById = new Map((partners ?? []).map((p: any) => [p.id, p]));
    const codeOf = (id?: string | null) =>
      (id && partnerById.get(id)?.code) || "unassigned";

    // ------------------------------------------------- economics aggregation
    const { data: econ } = await supabase
      .from("transaction_economics")
      .select(
        "partner_id, source_currency, dest_currency, amount, total_revenue, total_cost, gross_profit, pricing_missing",
      )
      .gte("created_at", since);

    interface Agg {
      partner_id: string | null;
      corridor: string;
      count: number;
      volume: number;
      revenue: number;
      cost: number;
      profit: number;
      negatives: number;
      gapCount: number;
      gapVolume: number;
    }
    const groups = new Map<string, Agg>();
    for (const e of econ ?? []) {
      const corridor = `${e.source_currency}→${e.dest_currency}`;
      const key = `${e.partner_id ?? "none"}|${corridor}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          partner_id: e.partner_id ?? null,
          corridor,
          count: 0,
          volume: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          negatives: 0,
          gapCount: 0,
          gapVolume: 0,
        };
        groups.set(key, g);
      }
      const amount = Number(e.amount) || 0;
      const profit = Number(e.gross_profit) || 0;
      g.count += 1;
      g.volume += amount;
      g.revenue += Number(e.total_revenue) || 0;
      g.cost += Number(e.total_cost) || 0;
      g.profit += profit;
      if (profit < 0) g.negatives += 1;
      if (e.pricing_missing) {
        g.gapCount += 1;
        g.gapVolume += amount;
      }
    }

    for (const g of groups.values()) {
      const margin = g.volume > 0 ? (g.profit / g.volume) * 100 : 0;

      if (g.volume >= cfg.partner_alert_min_volume && margin < cfg.partner_alert_min_margin_percent) {
        findings.push({
          fingerprint: `margin_floor:${g.partner_id ?? "none"}:${g.corridor}`,
          alert_type: "margin_floor",
          severity: g.profit < 0 ? "critical" : "warning",
          title: `${g.profit < 0 ? "Loss-making" : "Thin margin"} corridor ${g.corridor}`,
          message: `${codeOf(g.partner_id)} ${g.corridor}: ${margin.toFixed(2)}% margin on ${g.volume.toFixed(
            2,
          )} volume over ${windowDays} days (floor ${cfg.partner_alert_min_margin_percent}%). Profit ${g.profit.toFixed(2)}.`,
          partner_id: g.partner_id,
          corridor_key: g.corridor,
          metrics: {
            margin_percent: Number(margin.toFixed(4)),
            volume: g.volume,
            profit: g.profit,
            revenue: g.revenue,
            cost: g.cost,
            txn_count: g.count,
            window_days: windowDays,
          },
        });
      }

      if (g.negatives > 0) {
        findings.push({
          fingerprint: `negative_profit:${g.partner_id ?? "none"}:${g.corridor}`,
          alert_type: "negative_profit",
          severity: "warning",
          title: `Negative-profit transactions on ${g.corridor}`,
          message: `${g.negatives} of ${g.count} transaction(s) via ${codeOf(g.partner_id)} on ${g.corridor} settled below cost in the last ${windowDays} days.`,
          partner_id: g.partner_id,
          corridor_key: g.corridor,
          metrics: { negative_count: g.negatives, txn_count: g.count, window_days: windowDays },
        });
      }

      if (g.gapVolume >= cfg.partner_alert_gap_volume) {
        findings.push({
          fingerprint: `pricing_gap:${g.partner_id ?? "none"}:${g.corridor}`,
          alert_type: "pricing_gap",
          severity: "critical",
          title: `Pricing gap on ${g.corridor}`,
          message: `${g.gapCount} transaction(s) worth ${g.gapVolume.toFixed(2)} priced with no partner rate card for ${codeOf(
            g.partner_id,
          )} ${g.corridor}. Costs are understated until pricing is loaded.`,
          partner_id: g.partner_id,
          corridor_key: g.corridor,
          metrics: { gap_count: g.gapCount, gap_volume: g.gapVolume, window_days: windowDays },
        });
      }
    }

    // ------------------------------------------------------------- readiness
    const { data: readiness } = await supabase.rpc("corridor_readiness");
    for (const r of (readiness ?? []) as any[]) {
      if (!r.enabled || r.ready) continue;
      const missing = [
        !r.has_pricing && "pricing",
        !r.has_fx && "FX",
        !r.has_liquidity && "liquidity",
        r.liquidity_stale && "fresh liquidity",
        !r.has_performance && "performance history",
      ].filter(Boolean);
      if (!missing.length) continue;
      const corridor = `${r.source_currency}→${r.dest_currency}`;
      findings.push({
        fingerprint: `corridor_not_ready:${r.corridor_id}`,
        alert_type: "corridor_not_ready",
        severity: r.live_routing_enabled ? "critical" : "warning",
        title: `Corridor not ready: ${r.partner_code} ${corridor}`,
        message: `${r.partner_name} ${corridor}${r.dest_country ? ` (${r.dest_country})` : ""} is enabled but missing ${missing.join(
          ", ",
        )}.${r.live_routing_enabled ? " Live routing is on for this corridor." : ""}`,
        partner_id: r.partner_id,
        corridor_key: corridor,
        metrics: { missing, live_routing_enabled: r.live_routing_enabled },
      });
    }

    // ------------------------------------------------------------- liquidity
    const { data: liq } = await supabase
      .from("partner_liquidity")
      .select("partner_id, currency_code, available_balance, required_reserve, as_of");
    for (const l of (liq ?? []) as any[]) {
      const headroom = (Number(l.available_balance) || 0) - (Number(l.required_reserve) || 0);
      if (headroom > 0) continue;
      findings.push({
        fingerprint: `liquidity_low:${l.partner_id}:${l.currency_code}`,
        alert_type: "liquidity_low",
        severity: headroom < 0 ? "critical" : "warning",
        title: `Liquidity below reserve: ${codeOf(l.partner_id)} ${l.currency_code}`,
        message: `${codeOf(l.partner_id)} has ${Number(l.available_balance).toFixed(2)} ${l.currency_code} against a ${Number(
          l.required_reserve,
        ).toFixed(2)} reserve. The router will skip this partner.`,
        partner_id: l.partner_id,
        corridor_key: l.currency_code,
        metrics: {
          available_balance: Number(l.available_balance),
          required_reserve: Number(l.required_reserve),
          headroom,
          as_of: l.as_of,
        },
      });
    }

    // ------------------------------------------------------ persist findings
    const nowIso = new Date().toISOString();
    const fingerprints = findings.map((f) => f.fingerprint);

    const { data: existing } = fingerprints.length
      ? await supabase
          .from("partner_alerts")
          .select("id, fingerprint, occurrences, status")
          .in("fingerprint", fingerprints)
      : { data: [] as any[] };
    const existingByFp = new Map((existing ?? []).map((a: any) => [a.fingerprint, a]));

    let created = 0;
    let updated = 0;
    for (const f of findings) {
      const prev = existingByFp.get(f.fingerprint);
      if (prev) {
        const { error } = await supabase
          .from("partner_alerts")
          .update({
            severity: f.severity,
            title: f.title,
            message: f.message.slice(0, 2000),
            metrics: f.metrics ?? {},
            occurrences: Number(prev.occurrences ?? 1) + 1,
            last_seen_at: nowIso,
            // a resolved alert that fires again is reopened
            status: prev.status === "resolved" ? "open" : prev.status,
            resolved_at: prev.status === "resolved" ? null : undefined,
            resolved_by: prev.status === "resolved" ? null : undefined,
          })
          .eq("id", prev.id);
        if (error) console.error("alert update failed", f.fingerprint, error.message);
        else updated += 1;
      } else {
        const { error } = await supabase.from("partner_alerts").insert({
          fingerprint: f.fingerprint,
          alert_type: f.alert_type,
          severity: f.severity,
          title: f.title,
          message: f.message.slice(0, 2000),
          partner_id: f.partner_id ?? null,
          corridor_key: f.corridor_key ?? null,
          metrics: f.metrics ?? {},
          first_seen_at: nowIso,
          last_seen_at: nowIso,
        });
        if (error) console.error("alert insert failed", f.fingerprint, error.message);
        else created += 1;
      }
    }

    // auto-resolve open alerts that no longer reproduce
    const { data: openAlerts } = await supabase
      .from("partner_alerts")
      .select("id, fingerprint")
      .neq("status", "resolved");
    const active = new Set(fingerprints);
    const stale = (openAlerts ?? []).filter((a: any) => !active.has(a.fingerprint));
    if (stale.length) {
      await supabase
        .from("partner_alerts")
        .update({ status: "resolved", resolved_at: nowIso, notes_source: undefined })
        .in("id", stale.map((a: any) => a.id));
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned: groups.size,
        findings: findings.length,
        created,
        updated,
        auto_resolved: stale.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("partner-alerts-scan failed", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
