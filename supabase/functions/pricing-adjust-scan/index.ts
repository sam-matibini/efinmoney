// Phase 11 — Automated fee adjustments.
// Turns pricing_recommendations into reviewable pricing_proposals, honouring
// qualification thresholds, fee-move caps and per-corridor cooldowns.
// Runs daily by cron (service role) or on demand by a pricing manager.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { applyProposal, loadSettings } from "../_shared/pricingProposals.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

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
    let userId: string | null = null;
    if (token) {
      const { data: userData } = await supabase.auth.getUser(token);
      const user = userData?.user;
      if (user) {
        const { data: isManager } = await supabase.rpc("is_pricing_manager", { _uid: user.id });
        if (!isManager) return json({ success: false, error: "Forbidden" }, 403);
        userId = user.id;
      }
    }

    const settings = await loadSettings(supabase);
    const force = req.method === "POST"
      ? !!(await req.json().catch(() => ({}))).force
      : false;

    if (!settings.enabled && !force) {
      return json({ success: true, skipped: true, reason: "Fee adjustment scanning is disabled" });
    }

    const to = new Date();
    const from = new Date(to.getTime() - settings.lookback_days * 86_400_000);

    const { data: recs, error: recErr } = await supabase.rpc("pricing_recommendations", {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_target_margin: settings.target_margin_percent,
    });
    if (recErr) throw new Error(recErr.message);

    // existing proposals for cooldown / dedupe
    const { data: existing } = await supabase
      .from("pricing_proposals")
      .select("id, group_key, status, created_at, applied_at")
      .order("created_at", { ascending: false })
      .limit(2000);

    const pendingByGroup = new Map<string, string>();
    const lastAppliedByGroup = new Map<string, number>();
    for (const p of existing ?? []) {
      if (p.status === "pending" && !pendingByGroup.has(p.group_key)) {
        pendingByGroup.set(p.group_key, p.id);
      }
      if (p.status === "applied" && p.applied_at && !lastAppliedByGroup.has(p.group_key)) {
        lastAppliedByGroup.set(p.group_key, new Date(p.applied_at).getTime());
      }
    }

    const cooldownMs = settings.cooldown_days * 86_400_000;
    const nowMs = Date.now();
    const cap = settings.max_fee_delta_percent;

    let raised = 0;
    let applied = 0;
    let skippedCooldown = 0;
    let skippedThreshold = 0;
    let cappedCount = 0;
    const supersede: string[] = [];

    for (const r of recs ?? []) {
      const groupKey = String(r.group_key);
      const txnCount = num(r.txn_count);
      const volume = num(r.volume);

      if (txnCount < settings.min_txn_count || volume < settings.min_volume) {
        skippedThreshold += 1;
        continue;
      }

      const lastApplied = lastAppliedByGroup.get(groupKey);
      if (lastApplied && nowMs - lastApplied < cooldownMs) {
        skippedCooldown += 1;
        continue;
      }

      const currentPct = num(r.current_percentage_fee);
      let proposedPct = num(r.recommended_percentage_fee);
      let rawDelta = proposedPct - currentPct;

      // nothing meaningful to change
      if (Math.abs(rawDelta) < 0.0001) continue;

      // clamp the move to the configured cap
      if (cap > 0 && Math.abs(rawDelta) > cap) {
        rawDelta = rawDelta > 0 ? cap : -cap;
        proposedPct = Math.max(0, Math.round((currentPct + rawDelta) * 10000) / 10000);
        cappedCount += 1;
      }

      const prevPending = pendingByGroup.get(groupKey);
      if (prevPending) supersede.push(prevPending);

      const row = {
        group_key: groupKey,
        group_label: String(r.group_label ?? groupKey),
        direction: "payout",
        source_currency: String(r.source_currency),
        dest_currency: String(r.dest_currency),
        dest_country: r.dest_country ?? null,
        payment_method: r.payment_method ?? null,
        customer_type: "consumer",
        current_fixed_fee: num(r.current_fixed_fee),
        current_percentage_fee: currentPct,
        current_fx_margin_bps: 0,
        proposed_fixed_fee: num(r.current_fixed_fee),
        proposed_percentage_fee: proposedPct,
        proposed_fx_margin_bps: 0,
        fee_delta_percent: Math.round(rawDelta * 10000) / 10000,
        txn_count: Math.round(txnCount),
        volume: Math.round(volume * 100) / 100,
        revenue: num(r.revenue),
        effective_cost: num(r.effective_cost),
        current_margin_percent: num(r.current_margin_percent),
        target_margin_percent: num(r.target_margin_percent, settings.target_margin_percent),
        expected_revenue_uplift: num(r.revenue_uplift),
        source: "auto_scan",
        status: "pending",
        created_by: userId,
      };

      const { data: inserted, error: insErr } = await supabase
        .from("pricing_proposals")
        .insert(row)
        .select("*")
        .single();
      if (insErr) {
        console.error("proposal insert failed", groupKey, insErr.message);
        continue;
      }
      raised += 1;

      if (settings.auto_apply) {
        const res = await applyProposal(supabase, inserted, settings, userId);
        if (res.ok) applied += 1;
        else console.error("auto-apply failed", groupKey, res.error);
      }
    }

    if (supersede.length) {
      await supabase
        .from("pricing_proposals")
        .update({ status: "superseded" })
        .in("id", supersede)
        .eq("status", "pending");
    }

    return json({
      success: true,
      evaluated: (recs ?? []).length,
      raised,
      applied,
      capped: cappedCount,
      superseded: supersede.length,
      skipped_cooldown: skippedCooldown,
      skipped_threshold: skippedThreshold,
      auto_apply: settings.auto_apply,
    });
  } catch (e) {
    console.error("pricing-adjust-scan failed", e);
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
