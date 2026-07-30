// Hourly routing health sweep: raises admin notifications for pricing gaps,
// degraded partners, stale data, active kill switches and negative margins.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Finding {
  severity: "critical" | "warning";
  title: string;
  message: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const findings: Finding[] = [];

  try {
    // 1. Kill switch / execution mode
    const { data: rule } = await supabase
      .from("routing_rules")
      .select("name, kill_switch, execution_mode, min_success_rate")
      .eq("is_active", true)
      .maybeSingle();

    if (rule?.kill_switch) {
      findings.push({
        severity: "critical",
        title: "Routing kill switch is active",
        message: `Rule "${rule.name}" has the kill switch engaged — the engine is not routing any traffic.`,
      });
    }

    // 2. Corridors transacting with no pricing on file
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: gapRows } = await supabase
      .from("transaction_economics")
      .select("source_currency, dest_currency, partner_id")
      .eq("pricing_missing", true)
      .gte("created_at", since);

    if (gapRows?.length) {
      const corridors = [
        ...new Set(gapRows.map((g: any) => `${g.source_currency}→${g.dest_currency}`)),
      ];
      findings.push({
        severity: "critical",
        title: "Transactions priced without a partner rate card",
        message: `${gapRows.length} transaction(s) in the last 7 days had no partner pricing: ${corridors.slice(0, 6).join(", ")}. Their cost is understated.`,
      });
    }

    // 3. Partners below the success-rate floor
    const floor = Number(rule?.min_success_rate ?? 0);
    if (floor > 0) {
      const { data: perf } = await supabase
        .from("partner_performance")
        .select("partner_id, corridor_key, success_rate, total_count")
        .eq("window_days", 30)
        .eq("corridor_key", "ALL")
        .gt("total_count", 5)
        .lt("success_rate", floor);

      if (perf?.length) {
        const { data: partners } = await supabase
          .from("payment_partners")
          .select("id, code")
          .in("id", perf.map((p: any) => p.partner_id));
        const codeById = new Map((partners ?? []).map((p: any) => [p.id, p.code]));
        findings.push({
          severity: "warning",
          title: "Partner success rate below floor",
          message: perf
            .map((p: any) => `${codeById.get(p.partner_id) ?? p.partner_id}: ${Number(p.success_rate).toFixed(1)}%`)
            .join(", ") + ` (floor ${floor}%).`,
        });
      }
    }

    // 4. Stale liquidity snapshots
    const { data: partners } = await supabase
      .from("payment_partners")
      .select("id, code, liquidity_stale_minutes")
      .eq("status", "active");
    const staleLimitBy = new Map(
      (partners ?? []).map((p: any) => [p.id, Number(p.liquidity_stale_minutes ?? 720)]),
    );
    const { data: liq } = await supabase
      .from("partner_liquidity")
      .select("partner_id, currency_code, as_of");
    const staleList = (liq ?? []).filter((l: any) => {
      const limit = staleLimitBy.get(l.partner_id);
      if (!limit) return false;
      return (Date.now() - new Date(l.as_of).getTime()) / 60000 > limit;
    });
    if (staleList.length) {
      const codeById = new Map((partners ?? []).map((p: any) => [p.id, p.code]));
      findings.push({
        severity: "warning",
        title: "Stale partner liquidity",
        message: `${staleList.length} balance snapshot(s) are past their freshness window: ${staleList
          .slice(0, 6)
          .map((l: any) => `${codeById.get(l.partner_id) ?? "?"} ${l.currency_code}`)
          .join(", ")}. Those partners are skipped by the router.`,
      });
    }

    // 5. Stale partner FX quotes (older than 48h)
    const { data: fx } = await supabase
      .from("partner_fx_rates")
      .select("partner_id, base_currency, quote_currency, rate_timestamp")
      .gte("rate_timestamp", new Date(Date.now() - 48 * 3_600_000).toISOString())
      .limit(1);
    const { count: fxTotal } = await supabase
      .from("partner_fx_rates")
      .select("id", { count: "exact", head: true });
    if ((fxTotal ?? 0) > 0 && !fx?.length) {
      findings.push({
        severity: "warning",
        title: "Partner FX quotes are stale",
        message: "No partner FX quote has been refreshed in the last 48 hours; FX cost estimates may be wrong.",
      });
    }

    // 6. Negative-margin corridors in the last 30 days
    const { data: econ } = await supabase
      .from("transaction_economics")
      .select("source_currency, dest_currency, gross_profit")
      .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
    const byCorridor = new Map<string, number>();
    for (const e of econ ?? []) {
      const k = `${e.source_currency}→${e.dest_currency}`;
      byCorridor.set(k, (byCorridor.get(k) ?? 0) + (Number(e.gross_profit) || 0));
    }
    const losing = [...byCorridor.entries()].filter(([, v]) => v < 0);
    if (losing.length) {
      findings.push({
        severity: "critical",
        title: "Loss-making corridors",
        message: losing
          .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
          .slice(0, 8)
          .join(", "),
      });
    }

    if (findings.length) {
      // admin_notifications is per-admin; fan the findings out to every
      // super admin and compliance/finance-capable admin user.
      const { data: admins } = await supabase.from("admin_users").select("id");
      const rows = (admins ?? []).flatMap((a: any) =>
        findings.map((f) => ({
          admin_id: a.id,
          type: "routing_health",
          payload: {
            severity: f.severity,
            title: f.title,
            message: f.message.slice(0, 1000),
            source: "routing-health-check",
          },
        })),
      );
      if (rows.length) {
        const { error } = await supabase.from("admin_notifications").insert(rows);
        if (error) console.error("admin_notifications insert failed", error.message);
      }
    }

    return new Response(JSON.stringify({ success: true, findings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("routing-health-check failed", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
