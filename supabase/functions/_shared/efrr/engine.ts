/**
 * eFinMoney EFX Reference Rate (EFRR) engine.
 *
 * Tier 1 — Bank of Canada (Valet daily FX vs CAD)
 * Tier 2 — Open Exchange Rates (USD book; er-api fallback)
 * Tier 3 — ECB eurofxref validation (not a customer quote)
 * Tier 4 — partner/provider execution rate lives outside this module
 *
 * EFRR is the immutable reference used for accounting, reporting, compliance
 * and historical analysis. Customer quotes apply corridor EX spread on the
 * liquidity-aware benchmark (execution rate if live, else EFRR).
 */

export const EFRR_PRIMARY = "bank_of_canada";
export const EFRR_FALLBACK = "open_exchange_rates";
export const EFRR_VALIDATION = "ecb";

export const EFRR_CORE = [
  "USD", "CAD", "EUR", "GBP", "NGN", "KES", "UGX", "TZS", "ZMW", "BIF", "MZN",
  "GHS", "RWF", "XAF", "XOF", "MWK", "ZAR", "BWP",
] as const;

export type EfrrSource = typeof EFRR_PRIMARY | typeof EFRR_FALLBACK | typeof EFRR_VALIDATION | "open.er-api.com" | "usd_peg" | "manual";

export type FxObservation = {
  source: string;
  sourceSeries?: string;
  baseCurrency: string;
  quoteCurrency: string;
  /** Units of quote per 1 base. */
  rate: number;
  observedAt: string;
  publishedAt?: string | null;
  raw?: Record<string, unknown>;
};

export type EfrrPublished = {
  fromCurrency: string;
  toCurrency: string;
  referenceRate: number;
  primarySource: string;
  primaryRate: number | null;
  primaryObservedAt: string | null;
  fallbackSource: string | null;
  fallbackRate: number | null;
  validationSource: string | null;
  validationRate: number | null;
  validationDeltaBps: number | null;
  validationStatus: "matched" | "diverged" | "unavailable" | "unchecked";
};

export type UsdBook = { source: string; rates: Record<string, number>; asOf: string };

const r8 = (n: number) => Math.round(n * 1e8) / 1e8;

export function pairKey(from: string, to: string): string {
  return `${from.toUpperCase()}/${to.toUpperCase()}`;
}

export function invertRate(rate: number): number | null {
  if (!(rate > 0)) return null;
  return r8(1 / rate);
}

export function crossVia(fromToPivot: number, pivotToDest: number): number | null {
  if (!(fromToPivot > 0) || !(pivotToDest > 0)) return null;
  return r8(fromToPivot * pivotToDest);
}

export function bpsDelta(a: number, b: number): number | null {
  if (!(a > 0) || !(b > 0)) return null;
  return Math.round(((a - b) / a) * 10_000 * 100) / 100;
}

/** BoC Valet series FXUSDCAD → USD/CAD (CAD per 1 USD). */
export function parseBocSeriesCode(series: string): { base: string; quote: string } | null {
  const m = /^FX([A-Z]{3})([A-Z]{3})$/.exec(series.toUpperCase());
  if (!m) return null;
  return { base: m[1], quote: m[2] };
}

export function parseBocValetJson(json: unknown, fetchedAt = new Date().toISOString()): FxObservation[] {
  const root = (json ?? {}) as Record<string, unknown>;
  const observations = Array.isArray(root.observations) ? root.observations : [];
  const latest = observations[observations.length - 1] as Record<string, unknown> | undefined;
  if (!latest) return [];
  const published = String(latest.d || "").slice(0, 10) || fetchedAt.slice(0, 10);
  const publishedAt = `${published}T20:30:00.000-04:00`;
  const out: FxObservation[] = [];
  for (const [key, cell] of Object.entries(latest)) {
    if (key === "d") continue;
    const pair = parseBocSeriesCode(key);
    if (!pair) continue;
    const v = Number((cell as { v?: string } | null)?.v);
    if (!(v > 0)) continue;
    out.push({
      source: EFRR_PRIMARY,
      sourceSeries: key,
      baseCurrency: pair.base,
      quoteCurrency: pair.quote,
      rate: r8(v),
      observedAt: fetchedAt,
      publishedAt,
      raw: { d: latest.d, series: key },
    });
  }
  return out;
}

export function parseEcbEurofxrefXml(xml: string, fetchedAt = new Date().toISOString()): FxObservation[] {
  const time = /<Cube\s+time="([^"]+)"/.exec(xml)?.[1] ?? fetchedAt.slice(0, 10);
  const out: FxObservation[] = [];
  const re = /<Cube\s+currency="([A-Z]{3})"\s+rate="([0-9.]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const quote = m[1];
    const rate = Number(m[2]);
    if (!(rate > 0)) continue;
    out.push({
      source: EFRR_VALIDATION,
      sourceSeries: `EUR${quote}`,
      baseCurrency: "EUR",
      quoteCurrency: quote,
      rate: r8(rate),
      observedAt: fetchedAt,
      publishedAt: `${time}T16:00:00.000+02:00`,
    });
  }
  return out;
}

export function usdBookFromOxr(json: unknown, source: string, fetchedAt = new Date().toISOString()): UsdBook {
  const root = (json ?? {}) as Record<string, unknown>;
  const rates = { USD: 1, ...((root.rates as Record<string, number>) || {}) };
  const ts = Number(root.timestamp);
  const asOf = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : fetchedAt;
  return { source, rates, asOf };
}

export function observationsFromUsdBook(book: UsdBook): FxObservation[] {
  const out: FxObservation[] = [];
  for (const [code, rate] of Object.entries(book.rates)) {
    const n = Number(rate);
    if (code === "USD" || !(n > 0)) continue;
    out.push({
      source: book.source,
      sourceSeries: `USD${code}`,
      baseCurrency: "USD",
      quoteCurrency: code.toUpperCase(),
      rate: r8(n),
      observedAt: book.asOf,
      publishedAt: book.asOf,
    });
  }
  return out;
}

export type RateMap = Map<string, FxObservation>;

export function indexObservations(rows: FxObservation[]): RateMap {
  const map: RateMap = new Map();
  for (const row of rows) {
    map.set(pairKey(row.baseCurrency, row.quoteCurrency), row);
    const inv = invertRate(row.rate);
    if (inv) {
      const ik = pairKey(row.quoteCurrency, row.baseCurrency);
      if (!map.has(ik)) {
        map.set(ik, {
          ...row,
          baseCurrency: row.quoteCurrency,
          quoteCurrency: row.baseCurrency,
          rate: inv,
          sourceSeries: row.sourceSeries ? `${row.sourceSeries}_INV` : undefined,
        });
      }
    }
  }
  return map;
}

function lookup(map: RateMap, from: string, to: string): FxObservation | null {
  if (from === to) {
    return {
      source: "usd_peg",
      baseCurrency: from,
      quoteCurrency: to,
      rate: 1,
      observedAt: new Date().toISOString(),
    };
  }
  return map.get(pairKey(from, to)) ?? null;
}

function usdCross(book: UsdBook, from: string, to: string): number | null {
  const a = from === "USD" ? 1 : Number(book.rates[from]);
  const b = to === "USD" ? 1 : Number(book.rates[to]);
  if (!(a > 0) || !(b > 0)) return null;
  return r8(b / a);
}

/**
 * Resolve one EFRR pair: BoC first (including CAD crosses), then hybrid
 * BoC CAD/USD × OXR exotic, then OXR USD book, then ECB EUR cross.
 */
export function resolveEfrrPair(
  from: string,
  to: string,
  boc: RateMap,
  oxr: UsdBook | null,
  ecb: RateMap,
): EfrrPublished {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  let primary: FxObservation | null = lookup(boc, f, t);
  let fallbackRate: number | null = oxr ? usdCross(oxr, f, t) : null;
  let fallbackSource: string | null = fallbackRate ? oxr!.source : null;
  let reference: number | null = primary?.rate ?? null;
  let primarySource = primary ? EFRR_PRIMARY : "";

  if (reference == null && oxr) {
    // Hybrid: BoC USD/CAD (or CAD/USD) with OXR exotic vs USD.
    const bocUsdCad = lookup(boc, "USD", "CAD");
    if (bocUsdCad && f === "CAD" && t !== "USD") {
      const usdTo = Number(oxr.rates[t]);
      if (usdTo > 0) {
        reference = r8(usdTo / bocUsdCad.rate);
        primary = {
          source: `${EFRR_PRIMARY}+${oxr.source}`,
          baseCurrency: f,
          quoteCurrency: t,
          rate: reference,
          observedAt: bocUsdCad.observedAt,
          publishedAt: bocUsdCad.publishedAt,
          sourceSeries: `FXUSDCAD*USD${t}`,
        };
        primarySource = `${EFRR_PRIMARY}+${EFRR_FALLBACK}`;
        fallbackRate = usdCross(oxr, f, t);
        fallbackSource = oxr.source;
      }
    } else if (bocUsdCad && t === "CAD" && f !== "USD") {
      const usdFrom = Number(oxr.rates[f]);
      if (usdFrom > 0) {
        reference = r8(bocUsdCad.rate / usdFrom);
        primary = {
          source: `${EFRR_PRIMARY}+${oxr.source}`,
          baseCurrency: f,
          quoteCurrency: t,
          rate: reference,
          observedAt: bocUsdCad.observedAt,
          publishedAt: bocUsdCad.publishedAt,
          sourceSeries: `USD${f}*FXUSDCAD`,
        };
        primarySource = `${EFRR_PRIMARY}+${EFRR_FALLBACK}`;
        fallbackRate = usdCross(oxr, f, t);
        fallbackSource = oxr.source;
      }
    }
  }

  if (reference == null && fallbackRate) {
    reference = fallbackRate;
    primarySource = oxr?.source === "open.er-api.com" ? "open.er-api.com" : EFRR_FALLBACK;
    primary = {
      source: primarySource,
      baseCurrency: f,
      quoteCurrency: t,
      rate: fallbackRate,
      observedAt: oxr?.asOf ?? new Date().toISOString(),
    };
    fallbackRate = null;
    fallbackSource = null;
  }

  const ecbDirect = lookup(ecb, f, t);
  let validationRate = ecbDirect?.rate ?? null;
  if (validationRate == null) {
    const eurFrom = lookup(ecb, "EUR", f);
    const eurTo = lookup(ecb, "EUR", t);
    if (f === "EUR" && eurTo) validationRate = eurTo.rate;
    else if (t === "EUR" && eurFrom) validationRate = invertRate(eurFrom.rate);
    else if (eurFrom && eurTo) validationRate = r8(eurTo.rate / eurFrom.rate);
  }

  let validationStatus: EfrrPublished["validationStatus"] = "unavailable";
  let validationDeltaBps: number | null = null;
  if (reference && validationRate) {
    validationDeltaBps = bpsDelta(reference, validationRate);
    validationStatus = Math.abs(validationDeltaBps ?? 999) <= 150 ? "matched" : "diverged";
  }

  return {
    fromCurrency: f,
    toCurrency: t,
    referenceRate: reference ?? 0,
    primarySource: primarySource || EFRR_FALLBACK,
    primaryRate: primary?.rate ?? null,
    primaryObservedAt: primary?.publishedAt ?? primary?.observedAt ?? null,
    fallbackSource,
    fallbackRate,
    validationSource: validationRate ? EFRR_VALIDATION : null,
    validationRate,
    validationDeltaBps,
    validationStatus,
  };
}

export function publishEfrrBook(
  pairs: Array<[string, string]>,
  boc: FxObservation[],
  oxr: UsdBook | null,
  ecb: FxObservation[],
): EfrrPublished[] {
  const bocMap = indexObservations(boc);
  const ecbMap = indexObservations(ecb);
  const out: EfrrPublished[] = [];
  for (const [from, to] of pairs) {
    if (from === to) continue;
    const row = resolveEfrrPair(from, to, bocMap, oxr, ecbMap);
    if (row.referenceRate > 0) out.push(row);
  }
  return out;
}

export function corePairs(codes: readonly string[] = EFRR_CORE): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const from of codes) {
    for (const to of codes) {
      if (from !== to) pairs.push([from, to]);
    }
  }
  return pairs;
}

/**
 * Liquidity-aware customer FX:
 *   BoC/OXR EFRR  →  partner execution  →  eFinMoney cost  →  customer rate
 * Never assume the published reference is a rate we can settle at.
 */
export function liquidityAwareBenchmark(efrr: number | null | undefined, execution: number | null | undefined): number | null {
  const exec = Number(execution);
  if (Number.isFinite(exec) && exec > 0) return exec;
  const ref = Number(efrr);
  if (Number.isFinite(ref) && ref > 0) return ref;
  return null;
}
