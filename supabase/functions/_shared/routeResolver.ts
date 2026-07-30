// Resolves ranked routing candidates for a corridor from the partner network
// tables, honouring operator overrides and the active routing rule.

import {
  scoreCandidates,
  type CandidateInput,
  type CustomerPricingRow,
  type PartnerPricingRow,
  type ScoredCandidate,
} from "./routingEngine.ts";

type Client = {
  from: (t: string) => any;
};

export interface RouteRequest {
  direction?: "payin" | "payout" | "both";
  source_currency: string;
  dest_currency: string;
  source_country?: string | null;
  dest_country?: string | null;
  payment_method?: string | null;
  customer_type?: string;
  amount: number;
}

export interface RouteResolution {
  rule: any | null;
  mode: "shadow" | "live" | "simulation";
  killSwitch: boolean;
  liveCorridor: boolean;
  candidates: ScoredCandidate[];
  excluded: Array<{ partner_code: string; reason: string }>;
  overrides: Array<{ type: string; partner_code: string; reason: string | null }>;
}

const up = (v: unknown) => String(v ?? "").toUpperCase();

export async function getActiveRule(supabase: Client) {
  const { data } = await supabase
    .from("routing_rules")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function resolveRoute(
  supabase: Client,
  req: RouteRequest,
): Promise<RouteResolution> {
  const direction = req.direction ?? "payout";
  const srcCcy = up(req.source_currency);
  const dstCcy = up(req.dest_currency);
  const dstCountry = req.dest_country ? up(req.dest_country) : null;
  const method = req.payment_method ?? null;
  const amount = Number(req.amount) || 0;

  const rule = await getActiveRule(supabase);
  const killSwitch = rule?.kill_switch === true;
  const mode = (rule?.execution_mode === "live" ? "live" : "shadow") as "shadow" | "live";

  const excluded: RouteResolution["excluded"] = [];

  // 1. Corridors that serve this route
  let corridorQuery = supabase
    .from("partner_corridors")
    .select("*")
    .eq("enabled", true)
    .eq("source_currency", srcCcy)
    .eq("dest_currency", dstCcy)
    .in("direction", [direction, "both"]);
  const { data: corridors } = await corridorQuery;

  const matching = (corridors ?? []).filter((c: any) => {
    if (dstCountry && c.dest_country && up(c.dest_country) !== dstCountry) return false;
    if (method && c.payment_method && c.payment_method !== "any" && c.payment_method !== method) {
      return false;
    }
    return true;
  });

  const liveCorridor = matching.some((c: any) => c.live_routing_enabled === true);

  if (!matching.length) {
    return { rule, mode, killSwitch, liveCorridor: false, candidates: [], excluded, overrides: [] };
  }

  const partnerIds = [...new Set(matching.map((c: any) => c.partner_id))];

  // 2. Partners
  const { data: partners } = await supabase
    .from("payment_partners")
    .select("*")
    .in("id", partnerIds);

  // 3. Overrides (pins / blocks)
  const { data: overrideRows } = await supabase
    .from("routing_overrides")
    .select("*")
    .eq("is_active", true);

  const applicableOverrides = (overrideRows ?? []).filter((o: any) => {
    if (o.expires_at && new Date(o.expires_at).getTime() < Date.now()) return false;
    if (o.direction && o.direction !== direction && o.direction !== "both") return false;
    if (o.source_currency && up(o.source_currency) !== srcCcy) return false;
    if (o.dest_currency && up(o.dest_currency) !== dstCcy) return false;
    if (o.dest_country && dstCountry && up(o.dest_country) !== dstCountry) return false;
    if (o.payment_method && method && o.payment_method !== method) return false;
    return true;
  });

  const blocked = new Set(
    applicableOverrides.filter((o: any) => o.override_type === "block").map((o: any) => o.partner_id),
  );
  const pinned = applicableOverrides.filter((o: any) => o.override_type === "pin").map((o: any) => o.partner_id);

  // 4. Pricing / performance / liquidity
  const { data: pricingRows } = await supabase
    .from("partner_pricing")
    .select("*")
    .in("partner_id", partnerIds)
    .eq("source_currency", srcCcy)
    .eq("dest_currency", dstCcy)
    .is("effective_to", null);

  const { data: perfRows } = await supabase
    .from("partner_performance")
    .select("*")
    .in("partner_id", partnerIds)
    .eq("window_days", 30);

  const { data: liqRows } = await supabase
    .from("partner_liquidity")
    .select("*")
    .in("partner_id", partnerIds)
    .eq("currency_code", dstCcy);

  const { data: fxRows } = await supabase
    .from("partner_fx_rates")
    .select("partner_id, fx_spread_bps, rate_timestamp")
    .in("partner_id", partnerIds)
    .eq("base_currency", srcCcy)
    .eq("quote_currency", dstCcy)
    .order("rate_timestamp", { ascending: false })
    .limit(200);

  const { data: limitRows } = await supabase
    .from("partner_limits")
    .select("*")
    .in("partner_id", partnerIds);


  const fxByPartner = new Map<string, number>();
  for (const r of fxRows ?? []) {
    if (!fxByPartner.has(r.partner_id)) fxByPartner.set(r.partner_id, Number(r.fx_spread_bps) || 0);
  }

  const inputs: CandidateInput[] = [];

  for (const corridor of matching) {
    const partner = (partners ?? []).find((p: any) => p.id === corridor.partner_id);
    if (!partner) continue;

    const label = partner.code;
    if (partner.status !== "active" || partner.integration_status !== "active") {
      excluded.push({ partner_code: label, reason: `partner ${partner.status}/${partner.integration_status}` });
      continue;
    }
    if (blocked.has(partner.id)) {
      excluded.push({ partner_code: label, reason: "blocked by operator override" });
      continue;
    }
    if (partner.min_transaction != null && amount < Number(partner.min_transaction)) {
      excluded.push({ partner_code: label, reason: "below partner minimum" });
      continue;
    }
    if (partner.max_transaction != null && amount > Number(partner.max_transaction)) {
      excluded.push({ partner_code: label, reason: "above partner maximum" });
      continue;
    }

    const limit = (limitRows ?? []).find(
      (l: any) => l.partner_id === partner.id && (l.corridor_id === corridor.id || l.currency_code === dstCcy),
    );
    if (limit?.min_amount != null && amount < Number(limit.min_amount)) {
      excluded.push({ partner_code: label, reason: "below corridor minimum" });
      continue;
    }
    if (limit?.max_amount != null && amount > Number(limit.max_amount)) {
      excluded.push({ partner_code: label, reason: "above corridor maximum" });
      continue;
    }

    const perf = (perfRows ?? []).find((p: any) => p.partner_id === partner.id);
    const successRate = perf?.success_rate != null ? Number(perf.success_rate) : null;
    if (rule?.min_success_rate != null && successRate != null && successRate < Number(rule.min_success_rate)) {
      excluded.push({ partner_code: label, reason: `success rate ${successRate}% below floor` });
      continue;
    }

    const liq = (liqRows ?? []).find((l: any) => l.partner_id === partner.id);
    const available = liq ? Number(liq.available_balance) - Number(liq.required_reserve ?? 0) : null;
    if (available != null && available < amount) {
      excluded.push({ partner_code: label, reason: "insufficient partner liquidity" });
      continue;
    }
    // A balance we can no longer trust is worse than no balance at all: the
    // partner may already be drained. Skip stale snapshots on live routing.
    if (liq) {
      const staleMinutes = Number(partner.liquidity_stale_minutes ?? 720);
      const ageMinutes = (Date.now() - new Date(liq.as_of).getTime()) / 60000;
      if (staleMinutes > 0 && ageMinutes > staleMinutes) {
        excluded.push({
          partner_code: label,
          reason: `liquidity snapshot stale (${Math.round(ageMinutes / 60)}h old)`,
        });
        continue;
      }
    }


    const pricing = ((pricingRows ?? []).find(
      (p: any) =>
        p.partner_id === partner.id &&
        (!p.payment_method || p.payment_method === "any" || p.payment_method === corridor.payment_method) &&
        (!p.dest_country || !dstCountry || up(p.dest_country) === dstCountry),
    ) ?? null) as PartnerPricingRow | null;

    inputs.push({
      partner_id: partner.id,
      partner_code: partner.code,
      partner_name: partner.name,
      function_slug: direction === "payin" ? partner.payin_function_slug : partner.payout_function_slug,
      est_minutes: corridor.est_minutes ?? null,
      reliability_score: Number(partner.reliability_score ?? 100),
      compliance_risk: partner.compliance_risk ?? "low",
      success_rate: successRate,
      fx_spread_bps: fxByPartner.get(partner.id) ?? null,
      available_liquidity: available,
      pricing,
      priority: Number(partner.priority ?? 100),
    });
  }

  // 5. Customer pricing (revenue side)
  const { data: custRows } = await supabase
    .from("efinmoney_pricing")
    .select("*")
    .eq("source_currency", srcCcy)
    .eq("dest_currency", dstCcy)
    .is("effective_to", null);

  const cust = (custRows ?? []).find(
    (c: any) =>
      (!c.customer_type || c.customer_type === (req.customer_type ?? "consumer")) &&
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

  let candidates = scoreCandidates(
    inputs,
    {
      weight_profit: Number(rule?.weight_profit ?? 40),
      weight_success: Number(rule?.weight_success ?? 25),
      weight_fx: Number(rule?.weight_fx ?? 15),
      weight_speed: Number(rule?.weight_speed ?? 10),
      weight_risk: Number(rule?.weight_risk ?? 10),
    },
    amount,
    customerPricing,
  );

  // Pins float to the top, in override order.
  if (pinned.length) {
    const pinnedSet = new Set(pinned);
    candidates = [
      ...candidates.filter((c) => pinnedSet.has(c.partner_id)),
      ...candidates.filter((c) => !pinnedSet.has(c.partner_id)),
    ];
  }

  return {
    rule,
    mode,
    killSwitch,
    liveCorridor,
    candidates,
    excluded,
    overrides: applicableOverrides.map((o: any) => {
      const p = (partners ?? []).find((x: any) => x.id === o.partner_id);
      return { type: o.override_type, partner_code: p?.code ?? o.partner_id, reason: o.reason ?? null };
    }),
  };
}

/** Persist a routing decision row and return its id. */
export async function logDecision(
  supabase: Client,
  args: {
    mode: "shadow" | "live" | "simulation";
    req: RouteRequest;
    resolution: RouteResolution;
    transfer_id?: string | null;
    actual_partner_id?: string | null;
    requested_by?: string | null;
  },
): Promise<string | null> {
  const { resolution: r, req } = args;
  const best = r.candidates[0];
  const { data, error } = await supabase
    .from("routing_decisions")
    .insert({
      mode: args.mode,
      direction: req.direction ?? "payout",
      source_country: req.source_country ?? null,
      dest_country: req.dest_country ?? null,
      source_currency: up(req.source_currency),
      dest_currency: up(req.dest_currency),
      payment_method: req.payment_method ?? null,
      customer_type: req.customer_type ?? "consumer",
      amount: Number(req.amount) || 0,
      strategy: r.rule?.strategy ?? "best_overall",
      routing_rule_id: r.rule?.id ?? null,
      selected_partner_id: best?.partner_id ?? null,
      actual_partner_id: args.actual_partner_id ?? null,
      candidates: r.candidates,
      excluded: r.excluded,
      best_expected_profit: best?.expected_profit ?? null,
      transfer_id: args.transfer_id ?? null,
      requested_by: args.requested_by ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) console.error("logDecision error", error.message);
  return data?.id ?? null;
}

/** Shadow observation: record what the engine would have chosen. */
export async function observeRoute(
  supabase: Client,
  req: RouteRequest,
  ctx: { transfer_id?: string | null; actual_partner_code?: string | null; requested_by?: string | null },
) {
  try {
    const resolution = await resolveRoute(supabase, req);
    let actualId: string | null = null;
    if (ctx.actual_partner_code) {
      const { data } = await supabase
        .from("payment_partners")
        .select("id")
        .eq("code", ctx.actual_partner_code)
        .maybeSingle();
      actualId = data?.id ?? null;
    }
    await logDecision(supabase, {
      mode: "shadow",
      req,
      resolution,
      transfer_id: ctx.transfer_id ?? null,
      actual_partner_id: actualId,
      requested_by: ctx.requested_by ?? null,
    });
  } catch (e) {
    console.error("observeRoute failed", e instanceof Error ? e.message : e);
  }
}
