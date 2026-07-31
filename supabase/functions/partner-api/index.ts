import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { quotePrice } from "../_shared/pricingService.ts";
import { authenticatePartner, type PartnerContext } from "../_shared/partnerApiAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Json = Record<string, unknown>;

const json = (body: Json, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });

const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

interface FxRow {
  from_currency: string;
  to_currency: string;
  rate: number | null;
  effective_rate: number | null;
  valid_from: string;
}

/** Latest valid rate per pair + a from→USD map for cross derivation. */
async function loadRates(supabase: ReturnType<typeof admin>) {
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("fx_rates")
    .select("from_currency,to_currency,rate,effective_rate,valid_from")
    .or(`valid_until.is.null,valid_until.gt.${nowIso}`)
    .order("valid_from", { ascending: false })
    .limit(5000);

  const rows = (data ?? []) as FxRow[];
  const latest = new Map<string, FxRow>();
  for (const r of rows) {
    const k = `${r.from_currency}/${r.to_currency}`;
    if (!latest.has(k)) latest.set(k, r);
  }

  // from → USD multipliers
  const toUsd = new Map<string, number>([["USD", 1]]);
  for (const r of latest.values()) {
    const eff = Number(r.effective_rate ?? r.rate ?? 0);
    if (!eff || eff <= 0) continue;
    if (r.to_currency === "USD" && !toUsd.has(r.from_currency)) toUsd.set(r.from_currency, eff);
    if (r.from_currency === "USD" && !toUsd.has(r.to_currency)) toUsd.set(r.to_currency, 1 / eff);
  }
  return { latest, toUsd };
}

function crossRate(
  from: string,
  to: string,
  latest: Map<string, FxRow>,
  toUsd: Map<string, number>,
): { rate: number; source: "direct" | "inverse" | "usd_cross" } | null {
  if (from === to) return { rate: 1, source: "direct" };
  const direct = latest.get(`${from}/${to}`);
  const d = Number(direct?.effective_rate ?? direct?.rate ?? 0);
  if (d > 0) return { rate: d, source: "direct" };

  const inverse = latest.get(`${to}/${from}`);
  const i = Number(inverse?.effective_rate ?? inverse?.rate ?? 0);
  if (i > 0) return { rate: 1 / i, source: "inverse" };

  const fu = toUsd.get(from);
  const tu = toUsd.get(to);
  if (fu && tu) return { rate: fu / tu, source: "usd_cross" };
  return null;
}

async function handleRates(supabase: ReturnType<typeof admin>, url: URL) {
  const base = (url.searchParams.get("base") ?? "USD").toUpperCase();
  const symbolsParam = url.searchParams.get("symbols");
  const symbols = symbolsParam
    ? symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : null;

  const { latest, toUsd } = await loadRates(supabase);
  const universe = symbols ?? Array.from(toUsd.keys()).sort();

  const rates = universe.flatMap((sym) => {
    if (sym === base) return [];
    const cross = crossRate(base, sym, latest, toUsd);
    if (!cross) return [];
    const direct = latest.get(`${base}/${sym}`);
    return [{
      from: base,
      to: sym,
      rate: cross.rate,
      mid_rate: Number(direct?.rate ?? 0) || cross.rate,
      derivation: cross.source,
      as_of: direct?.valid_from ?? null,
    }];
  });

  return { base, count: rates.length, rates };
}

async function handlePair(supabase: ReturnType<typeof admin>, from: string, to: string) {
  const { latest, toUsd } = await loadRates(supabase);
  const cross = crossRate(from, to, latest, toUsd);
  if (!cross) return null;
  const direct = latest.get(`${from}/${to}`);
  return {
    from,
    to,
    pair: `${from}/${to}`,
    rate: cross.rate,
    mid_rate: Number(direct?.rate ?? 0) || cross.rate,
    inverse_rate: cross.rate > 0 ? 1 / cross.rate : null,
    derivation: cross.source,
    as_of: direct?.valid_from ?? null,
  };
}

async function handleCorridors(supabase: ReturnType<typeof admin>, url: URL) {
  const nowIso = new Date().toISOString();
  let q = supabase
    .from("efinmoney_pricing")
    .select(
      "direction,source_currency,dest_currency,source_country,dest_country,payment_method,customer_type,fixed_fee,percentage_fee,min_fee,max_fee,fx_margin_bps,effective_from",
    )
    .lte("effective_from", nowIso)
    .or(`effective_to.is.null,effective_to.gt.${nowIso}`)
    .limit(1000);

  const src = url.searchParams.get("source_currency");
  const dst = url.searchParams.get("dest_currency");
  const country = url.searchParams.get("dest_country");
  if (src) q = q.eq("source_currency", src.toUpperCase());
  if (dst) q = q.eq("dest_currency", dst.toUpperCase());
  if (country) q = q.eq("dest_country", country.toUpperCase());

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const corridors = (data ?? []).map((r) => ({
    direction: r.direction,
    source_currency: r.source_currency,
    dest_currency: r.dest_currency,
    source_country: r.source_country,
    dest_country: r.dest_country,
    payment_method: r.payment_method,
    customer_type: r.customer_type,
    pricing: {
      fixed_fee: Number(r.fixed_fee ?? 0),
      percentage_fee: Number(r.percentage_fee ?? 0),
      min_fee: r.min_fee == null ? null : Number(r.min_fee),
      max_fee: r.max_fee == null ? null : Number(r.max_fee),
      fx_margin_bps: Number(r.fx_margin_bps ?? 0),
    },
    effective_from: r.effective_from,
  }));

  return { count: corridors.length, corridors };
}

async function handleQuote(supabase: ReturnType<typeof admin>, body: Json) {
  const direction = body.direction === "payin" ? "payin" : "payout";
  const sourceCurrency = String(body.source_currency ?? "").toUpperCase();
  const destCurrency = body.dest_currency ? String(body.dest_currency).toUpperCase() : sourceCurrency;
  const amount = Number(body.amount);

  if (!sourceCurrency || !Number.isFinite(amount) || amount <= 0) {
    return { error: "source_currency and a positive amount are required" };
  }

  const quote = await quotePrice(supabase, {
    direction,
    sourceCurrency,
    destCurrency,
    destCountry: body.dest_country ? String(body.dest_country).toUpperCase() : null,
    paymentMethod: body.payment_method ? String(body.payment_method) : null,
    customerType: body.customer_type ? String(body.customer_type) : "consumer",
    amount,
  });

  const { latest, toUsd } = await loadRates(supabase);
  const cross = crossRate(sourceCurrency, destCurrency, latest, toUsd);
  const midRate = cross?.rate ?? null;
  const customerRate =
    midRate == null ? null : midRate * (1 - Number(quote.fxMarginBps || 0) / 10_000);

  const sendAmount = amount;
  const amountAfterFee = Math.max(sendAmount - quote.fee, 0);
  const receiveAmount = customerRate == null ? null : Math.round(amountAfterFee * customerRate * 100) / 100;

  return {
    direction,
    source_currency: sourceCurrency,
    dest_currency: destCurrency,
    amount: sendAmount,
    fee: quote.fee,
    fx_margin_bps: quote.fxMarginBps,
    fx_revenue: quote.fxRevenue,
    total_cost: Math.round((sendAmount + quote.fee) * 100) / 100,
    mid_rate: midRate,
    customer_rate: customerRate,
    receive_amount: receiveAmount,
    pricing_missing: quote.pricingMissing,
    indicative: true,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const started = Date.now();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/partner-api/, "").replace(/\/+$/, "") || "/";
  const segments = path.split("/").filter(Boolean); // e.g. ["v1","rates","CAD","NGN"]
  const supabase = admin();
  const requestId = crypto.randomUUID();

  let partner: PartnerContext | null = null;
  let statusCode = 500;
  let errorText: string | null = null;

  const finish = async (body: Json, status: number, extra: Record<string, string> = {}) => {
    statusCode = status;
    if (status >= 400) errorText = String(body.error ?? "");
    await supabase.from("api_request_logs").insert({
      partner_id: partner?.partnerId ?? null,
      key_id: partner?.keyId ?? null,
      endpoint: path,
      method: req.method,
      status_code: statusCode,
      latency_ms: Date.now() - started,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      error: errorText,
    });
    return json({ ...body, request_id: requestId }, status, extra);
  };

  try {
    if (segments[0] !== "v1") {
      return await finish(
        { success: false, code: "not_found", error: "Unknown path. Use /v1/rates, /v1/corridors or /v1/quote." },
        404,
      );
    }

    const resource = segments[1];
    const scope = resource === "quote" ? "quote" : resource === "corridors" ? "corridors" : "rates";

    if (!["rates", "corridors", "quote"].includes(resource ?? "")) {
      return await finish({ success: false, code: "not_found", error: `Unknown resource '${resource ?? ""}'` }, 404);
    }

    const auth = await authenticatePartner(supabase, req, scope);
    if ("failure" in auth) {
      const extra = auth.failure.retryAfter ? { "Retry-After": String(auth.failure.retryAfter) } : {};
      return await finish(
        { success: false, code: auth.failure.code, error: auth.failure.error },
        auth.failure.status,
        extra,
      );
    }
    partner = auth.partner;
    await supabase
      .from("api_partner_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", partner.keyId);

    if (resource === "rates" && req.method === "GET") {
      if (segments.length >= 4) {
        const pair = await handlePair(supabase, segments[2].toUpperCase(), segments[3].toUpperCase());
        if (!pair) {
          return await finish({ success: false, code: "rate_unavailable", error: "No rate for this pair" }, 404);
        }
        return await finish({ success: true, data: pair }, 200);
      }
      return await finish({ success: true, data: await handleRates(supabase, url) }, 200);
    }

    if (resource === "corridors" && req.method === "GET") {
      return await finish({ success: true, data: await handleCorridors(supabase, url) }, 200);
    }

    if (resource === "quote" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as Json;
      const result = await handleQuote(supabase, body);
      if ("error" in result) {
        return await finish({ success: false, code: "invalid_request", error: result.error }, 400);
      }
      return await finish({ success: true, data: result }, 200);
    }

    return await finish(
      { success: false, code: "method_not_allowed", error: `${req.method} not supported on ${path}` },
      405,
    );
  } catch (e) {
    console.error("[partner-api] error", e);
    return await finish({ success: false, code: "server_error", error: (e as Error).message }, 500);
  }
});
