// Phase 6 — Network activation. Seeds partner_pricing, partner_fx_rates and the
// eFinMoney retail price book from the published rate cards so the routing and
// profitability engine has data to work with. Never overwrites a route that
// already has a current (effective_to IS NULL) row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { resolveRateCard, resolveRetail, PARTNER_RATE_CARDS } from "../_shared/partnerRateCards.ts";

const BodySchema = z.object({
  partner_id: z.string().uuid().optional().nullable(),
  scopes: z.array(z.enum(["pricing", "fx", "retail"])).min(1).default(["pricing", "fx", "retail"]),
  apply: z.boolean().default(false),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const midMarket = async (quotes: string[]): Promise<Record<string, number>> => {
  const out: Record<string, number> = {};
  if (!quotes.length) return out;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/CAD");
    if (res.ok) {
      const data = await res.json();
      const rates = data?.rates ?? {};
      quotes.forEach((q) => {
        if (typeof rates[q] === "number") out[q] = rates[q];
      });
    }
  } catch (e) {
    console.error("mid-market fetch failed", e);
  }
  return out;
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
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: isManager } = await supabase.rpc("is_pricing_manager", { _uid: user.id });
    if (!isManager) return json({ error: "Forbidden" }, 403);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { partner_id, scopes, apply } = parsed.data;

    const { data: partners, error: pErr } = await supabase
      .from("payment_partners")
      .select("id, code, name, status")
      .eq("status", "active");
    if (pErr) throw pErr;
    const partnerById = new Map((partners ?? []).map((p) => [p.id, p]));
    if (partner_id && !partnerById.has(partner_id)) {
      return json({ error: "Partner is not active — activate it before seeding." }, 400);
    }

    let corridorQuery = supabase
      .from("partner_corridors")
      .select("partner_id, direction, source_currency, dest_currency, dest_country, payment_method, enabled")
      .eq("enabled", true);
    if (partner_id) corridorQuery = corridorQuery.eq("partner_id", partner_id);
    const { data: corridors, error: cErr } = await corridorQuery;
    if (cErr) throw cErr;

    const pricingRows: Record<string, unknown>[] = [];
    const fxRows: Record<string, unknown>[] = [];
    const retailRows: Record<string, unknown>[] = [];
    const skipped: string[] = [];

    /* ------------------------------ pricing ------------------------------ */
    if (scopes.includes("pricing")) {
      const { data: existing } = await supabase
        .from("partner_pricing")
        .select("partner_id, direction, source_currency, dest_currency, payment_method")
        .is("effective_to", null);
      const have = new Set(
        (existing ?? []).map(
          (r) => `${r.partner_id}|${r.direction}|${r.source_currency}|${r.dest_currency}|${r.payment_method}`,
        ),
      );

      for (const c of corridors ?? []) {
        const partner = partnerById.get(c.partner_id);
        if (!partner) continue;
        const key = `${c.partner_id}|${c.direction}|${c.source_currency}|${c.dest_currency}|${c.payment_method}`;
        if (have.has(key)) continue;
        const card = resolveRateCard(partner.code, c.dest_currency, c.payment_method);
        if (!card) {
          skipped.push(`${partner.code}: no rate card on file`);
          continue;
        }
        have.add(key);
        pricingRows.push({
          partner_id: c.partner_id,
          partner_code: partner.code,
          direction: c.direction,
          source_currency: c.source_currency,
          dest_currency: c.dest_currency,
          dest_country: c.dest_country ?? null,
          payment_method: c.payment_method,
          fee_type: card.percentage_fee && card.fixed_fee ? "hybrid" : card.percentage_fee ? "percentage" : "fixed",
          fixed_fee: card.fixed_fee,
          percentage_fee: card.percentage_fee,
          min_fee: card.min_fee ?? null,
          max_fee: card.max_fee ?? null,
          fx_markup_bps: card.fx_markup_bps,
          settlement_fee: card.settlement_fee ?? 0,
          network_fee: card.network_fee ?? 0,
          compliance_fee: card.compliance_fee ?? 0,
          fee_currency: card.fee_currency ?? "CAD",
          source: "partner_portal",
          source_reference: card.reference,
        });
      }
    }

    /* -------------------------------- fx --------------------------------- */
    if (scopes.includes("fx")) {
      const pairs = new Map<string, { partner_id: string; code: string; base: string; quote: string }>();
      for (const c of corridors ?? []) {
        const partner = partnerById.get(c.partner_id);
        if (!partner || c.source_currency === c.dest_currency) continue;
        if (!PARTNER_RATE_CARDS[partner.code]) continue;
        pairs.set(`${c.partner_id}|${c.source_currency}|${c.dest_currency}`, {
          partner_id: c.partner_id,
          code: partner.code,
          base: c.source_currency,
          quote: c.dest_currency,
        });
      }
      const quotes = [...new Set([...pairs.values()].map((p) => p.quote))];
      const mid = await midMarket(quotes);
      const now = Date.now();
      for (const p of pairs.values()) {
        const m = mid[p.quote];
        if (!m) {
          skipped.push(`${p.base}/${p.quote}: no mid-market rate available`);
          continue;
        }
        const spread = PARTNER_RATE_CARDS[p.code]?.fx_spread_bps ?? 0;
        fxRows.push({
          partner_id: p.partner_id,
          partner_code: p.code,
          base_currency: p.base,
          quote_currency: p.quote,
          mid_market_rate: m,
          partner_rate: m * (1 - spread / 10_000),
          rate_timestamp: new Date(now).toISOString(),
          expires_at: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
          source: "api",
        });
      }
    }

    /* ------------------------------- retail ------------------------------ */
    if (scopes.includes("retail")) {
      const { data: existingRetail } = await supabase
        .from("efinmoney_pricing")
        .select("customer_type, direction, source_currency, dest_currency, payment_method")
        .is("effective_to", null);
      const have = new Set(
        (existingRetail ?? []).map(
          (r) =>
            `${r.customer_type}|${r.direction}|${r.source_currency}|${r.dest_currency}|${r.payment_method ?? ""}`,
        ),
      );
      const seen = new Set<string>();
      for (const c of corridors ?? []) {
        const routeKey = `${c.direction}|${c.source_currency}|${c.dest_currency}|${c.payment_method}`;
        if (seen.has(routeKey)) continue;
        seen.add(routeKey);
        for (const customer_type of ["consumer", "business"] as const) {
          const key = `${customer_type}|${routeKey}`;
          if (have.has(key)) continue;
          const retail = resolveRetail(c.dest_currency, c.payment_method);
          const business = customer_type === "business";
          retailRows.push({
            customer_type,
            direction: c.direction,
            source_currency: c.source_currency,
            dest_currency: c.dest_currency,
            dest_country: c.dest_country ?? null,
            payment_method: c.payment_method,
            fixed_fee: business ? Math.round(retail.fixed_fee * 0.8 * 100) / 100 : retail.fixed_fee,
            percentage_fee: retail.percentage_fee,
            fx_margin_bps: business ? Math.round(retail.fx_margin_bps * 0.8) : retail.fx_margin_bps,
            min_fee: retail.min_fee ?? null,
          });
        }
      }
    }

    const summary = {
      pricing: pricingRows.length,
      fx: fxRows.length,
      retail: retailRows.length,
      skipped: [...new Set(skipped)],
    };

    if (!apply) {
      return json({
        success: true,
        applied: false,
        summary,
        preview: {
          pricing: pricingRows.slice(0, 200),
          fx: fxRows.slice(0, 200),
          retail: retailRows.slice(0, 200),
        },
      });
    }

    if (pricingRows.length) {
      const { error } = await supabase
        .from("partner_pricing")
        .insert(pricingRows.map(({ partner_code: _c, ...r }) => ({ ...r, updated_by: user.id })));
      if (error) throw error;
    }
    if (fxRows.length) {
      const { error } = await supabase
        .from("partner_fx_rates")
        .insert(fxRows.map(({ partner_code: _c, ...r }) => ({ ...r, updated_by: user.id })));
      if (error) throw error;
    }
    if (retailRows.length) {
      const { error } = await supabase
        .from("efinmoney_pricing")
        .insert(retailRows.map((r) => ({ ...r, updated_by: user.id })));
      if (error) throw error;
    }

    return json({ success: true, applied: true, summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("partner-network-seed failed", message);
    return json({ success: false, error: message }, 500);
  }
});
