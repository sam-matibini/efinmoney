/**
 * partner-rates-refresh — Phase 1 of live partner pricing.
 *
 * Sweeps every enabled cross-currency corridor of partners that expose a rate
 * API, asks the partner for a live rate, derives the spread against our
 * mid-market snapshot and writes the result to `partner_fx_rates` with
 * source = 'api'. Partners without an adapter are reported as skipped.
 *
 * Manual/file rates are never overwritten — this table is append-only, so the
 * newest row wins in the UI while history stays auditable.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PARTNER_QUOTE_ADAPTERS, spreadBps } from "../_shared/partnerQuotes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** How long a live rate stays quotable before routing falls back. */
const TTL_MINUTES = 15;

interface Corridor {
  partner_id: string;
  source_currency: string;
  dest_currency: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const onlyPartner = typeof body?.partner_code === "string" ? body.partner_code.toLowerCase() : null;

    const { data: partners, error: partnerErr } = await supabase
      .from("payment_partners")
      .select("id, code, name")
      .eq("status", "active");
    if (partnerErr) throw partnerErr;

    const { data: corridorRows, error: corridorErr } = await supabase
      .from("partner_corridors")
      .select("partner_id, source_currency, dest_currency")
      .eq("enabled", true);
    if (corridorErr) throw corridorErr;

    // Mid-market snapshot (market `rate`, not the customer-facing effective rate).
    const { data: fxRows } = await supabase
      .from("fx_rates")
      .select("from_currency, to_currency, rate, valid_from")
      .order("valid_from", { ascending: false })
      .limit(5000);
    const mid = new Map<string, number>();
    for (const r of fxRows ?? []) {
      const key = `${r.from_currency}/${r.to_currency}`;
      const rate = Number(r.rate);
      if (rate > 0 && !mid.has(key)) mid.set(key, rate);
    }
    const midRate = (base: string, quote: string): number | null => {
      if (base === quote) return 1;
      const direct = mid.get(`${base}/${quote}`);
      if (direct) return direct;
      const inverse = mid.get(`${quote}/${base}`);
      if (inverse) return 1 / inverse;
      return null;
    };

    const byPartner = new Map<string, Corridor[]>();
    for (const c of (corridorRows ?? []) as Corridor[]) {
      if (!c.source_currency || !c.dest_currency) continue;
      if (c.source_currency === c.dest_currency) continue; // no conversion, no spread
      const list = byPartner.get(c.partner_id) ?? [];
      list.push(c);
      byPartner.set(c.partner_id, list);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60_000).toISOString();
    const inserts: Record<string, unknown>[] = [];
    const results: Record<string, unknown>[] = [];
    const skipped: string[] = [];

    for (const p of partners ?? []) {
      const code = String(p.code ?? "").toLowerCase();
      const adapter = PARTNER_QUOTE_ADAPTERS[code];
      if (!adapter) {
        skipped.push(p.code);
        continue;
      }
      if (onlyPartner && code !== onlyPartner) continue;

      // Dedupe pairs — several payment methods share one currency pair.
      const pairs = new Map<string, { base: string; quote: string }>();
      for (const c of byPartner.get(p.partner_id ?? p.id) ?? byPartner.get(p.id) ?? []) {
        pairs.set(`${c.source_currency}/${c.dest_currency}`, {
          base: c.source_currency.toUpperCase(),
          quote: c.dest_currency.toUpperCase(),
        });
      }

      for (const { base, quote } of pairs.values()) {
        const q = await adapter(base, quote);
        if (!q.ok || !q.rate) {
          results.push({ partner: p.code, pair: `${base}/${quote}`, ok: false, error: q.error });
          continue;
        }
        const market = midRate(base, quote);
        inserts.push({
          partner_id: p.id,
          base_currency: base,
          quote_currency: quote,
          partner_rate: q.rate,
          mid_market_rate: market,
          fx_spread_bps: market ? spreadBps(q.rate, market) : null,
          rate_timestamp: now.toISOString(),
          expires_at: expiresAt,
          source: "api",
        });
        results.push({
          partner: p.code,
          pair: `${base}/${quote}`,
          ok: true,
          partner_rate: q.rate,
          mid_market_rate: market,
        });
      }
    }

    if (inserts.length) {
      const { error: insertErr } = await supabase.from("partner_fx_rates").insert(inserts);
      if (insertErr) throw insertErr;
    }

    return json({
      ok: true,
      refreshed: inserts.length,
      attempted: results.length,
      failed: results.filter((r) => !r.ok).length,
      skipped_partners: skipped,
      ttl_minutes: TTL_MINUTES,
      results,
    });
  } catch (e) {
    console.error("[partner-rates-refresh]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
