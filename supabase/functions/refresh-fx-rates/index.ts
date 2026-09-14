import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corePairs, publishEfrrBook, EFRR_CORE } from "../_shared/efrr/engine.ts";
import { fetchBankOfCanada, fetchEcb, fetchOpenExchangeRates, oxrObservations } from "../_shared/efrr/fetchSources.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STABLES = ["USDC", "USDT"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const validUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    const [bocSettled, oxrSettled, ecbSettled] = await Promise.allSettled([
      fetchBankOfCanada(),
      fetchOpenExchangeRates(),
      fetchEcb(),
    ]);
    const bocResult = bocSettled.status === "fulfilled"
      ? { ok: true as const, rows: bocSettled.value, error: null as string | null }
      : { ok: false as const, error: String(bocSettled.reason?.message ?? bocSettled.reason), rows: [] as Awaited<ReturnType<typeof fetchBankOfCanada>> };
    const oxrResult = oxrSettled.status === "fulfilled"
      ? { ok: true as const, book: oxrSettled.value, error: null as string | null }
      : { ok: false as const, error: String(oxrSettled.reason?.message ?? oxrSettled.reason), book: null };
    const ecbResult = ecbSettled.status === "fulfilled"
      ? { ok: true as const, rows: ecbSettled.value, error: null as string | null }
      : { ok: false as const, error: String(ecbSettled.reason?.message ?? ecbSettled.reason), rows: [] as Awaited<ReturnType<typeof fetchEcb>> };

    if (!bocResult.ok && !oxrResult.ok) {
      throw new Error(`EFRR sources unavailable: BoC ${bocResult.error}; OXR ${oxrResult.error}`);
    }

    const oxrBook = oxrResult.ok ? oxrResult.book : null;
    const published = publishEfrrBook(corePairs(), bocResult.rows, oxrBook, ecbResult.rows);

    const observations = [
      ...bocResult.rows,
      ...(oxrBook ? oxrObservations(oxrBook) : []),
      ...ecbResult.rows,
    ].map((o) => ({
      source: o.source,
      source_series: o.sourceSeries ?? null,
      base_currency: o.baseCurrency,
      quote_currency: o.quoteCurrency,
      rate: o.rate,
      observed_at: o.observedAt,
      published_at: o.publishedAt ?? null,
      raw: o.raw ?? {},
    }));

    if (observations.length) {
      const { error: obsErr } = await supabase.from("efrr_observations").insert(observations);
      if (obsErr) console.warn("efrr_observations insert:", obsErr);
    }

    const efrrRows = published.map((row) => ({
      from_currency: row.fromCurrency,
      to_currency: row.toCurrency,
      reference_rate: row.referenceRate,
      primary_source: row.primarySource,
      primary_rate: row.primaryRate,
      primary_observed_at: row.primaryObservedAt,
      fallback_source: row.fallbackSource,
      fallback_rate: row.fallbackRate,
      validation_source: row.validationSource,
      validation_rate: row.validationRate,
      validation_delta_bps: row.validationDeltaBps,
      validation_status: row.validationStatus,
      status: "published",
      valid_from: nowIso,
      valid_until: validUntil,
    }));

    if (efrrRows.length) {
      const { error: efrrErr } = await supabase.from("efrr_rates").insert(efrrRows);
      if (efrrErr) console.warn("efrr_rates insert:", efrrErr);
    }

    const { data: ccyRows, error: ccyErr } = await supabase.from("currencies").select("code").eq("is_active", true);
    if (ccyErr) throw ccyErr;
    const tableCodes = new Set((ccyRows ?? []).map((r: { code: string }) => r.code));
    const coreSet = new Set(EFRR_CORE);

    const fxRows: Record<string, unknown>[] = published
      .filter((r) => tableCodes.has(r.fromCurrency) && tableCodes.has(r.toCurrency))
      .map((r) => ({
        from_currency: r.fromCurrency,
        to_currency: r.toCurrency,
        rate: r.referenceRate,
        markup_rate: 0,
        effective_rate: r.referenceRate,
        source: `efrr:${r.primarySource}`,
        valid_from: nowIso,
        valid_until: validUntil,
      }));

    if (oxrBook) {
      for (const [code, rateVal] of Object.entries(oxrBook.rates)) {
        if (code === "USD" || coreSet.has(code) || !tableCodes.has(code)) continue;
        const market = Number(rateVal);
        if (!(market > 0)) continue;
        fxRows.push({
          from_currency: "USD",
          to_currency: code,
          rate: market,
          markup_rate: 0,
          effective_rate: market,
          source: `efrr:${oxrBook.source}`,
          valid_from: nowIso,
          valid_until: validUntil,
        });
      }
    }

    for (const stable of STABLES) {
      if (!tableCodes.has(stable)) continue;
      fxRows.push({
        from_currency: "USD", to_currency: stable, rate: 1, markup_rate: 0, effective_rate: 1,
        source: "efrr:usd-peg", valid_from: nowIso, valid_until: validUntil,
      });
      fxRows.push({
        from_currency: stable, to_currency: "USD", rate: 1, markup_rate: 0, effective_rate: 1,
        source: "efrr:usd-peg", valid_from: nowIso, valid_until: validUntil,
      });
      for (const fiat of EFRR_CORE) {
        if (fiat === "USD") continue;
        const publishedPair = published.find((r) => r.fromCurrency === "USD" && r.toCurrency === fiat);
        const fiatPerUsd = publishedPair?.referenceRate ?? Number(oxrBook?.rates[fiat] ?? 0);
        if (!(fiatPerUsd > 0)) continue;
        fxRows.push({
          from_currency: fiat, to_currency: stable, rate: 1 / fiatPerUsd, markup_rate: 0,
          effective_rate: 1 / fiatPerUsd, source: "efrr:usd-peg", valid_from: nowIso, valid_until: validUntil,
        });
        fxRows.push({
          from_currency: stable, to_currency: fiat, rate: fiatPerUsd, markup_rate: 0,
          effective_rate: fiatPerUsd, source: "efrr:usd-peg", valid_from: nowIso, valid_until: validUntil,
        });
      }
    }

    const byPair = new Map<string, Record<string, unknown>>();
    for (const row of fxRows) {
      byPair.set(`${row.from_currency}|${row.to_currency}`, row);
    }
    const deduped = Array.from(byPair.values());
    const { error } = await supabase.from("fx_rates").insert(deduped);
    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        efrr: {
          primary: bocResult.ok ? "bank_of_canada" : (oxrBook?.source ?? null),
          boc_ok: bocResult.ok,
          boc_error: bocResult.ok ? null : bocResult.error,
          oxr_ok: oxrResult.ok,
          oxr_source: oxrBook?.source ?? null,
          oxr_error: oxrResult.ok ? null : oxrResult.error,
          ecb_ok: ecbResult.ok,
          ecb_error: ecbResult.ok ? null : ecbResult.error,
          published: published.length,
          observations: observations.length,
        },
        inserted: deduped.length,
        fetched_at: nowIso,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("refresh-fx-rates / EFRR error:", err);
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? JSON.stringify(err)
          : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
