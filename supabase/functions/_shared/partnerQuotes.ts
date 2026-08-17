/**
 * Live partner FX quote adapters.
 *
 * Each adapter asks one partner "what rate would you give me right now for
 * BASE->QUOTE?" and returns their rate. Spread is derived against mid-market
 * by the caller — never invented here.
 *
 * Adapters must NEVER throw: an unavailable partner returns
 * { ok: false, error } so one bad partner cannot stall the refresh sweep.
 */
import { wiseFetch } from "./wise.ts";
import { flwV3Fetch } from "./flw-v3.ts";
import { fetchNombaExchangeRate, isNombaNigeriaConfigured } from "./nomba-nigeria.ts";
import { fincraFetch, getFincraConfig } from "./fincra.ts";

export interface PartnerQuote {
  ok: boolean;
  rate?: number;
  error?: string;
  /** Raw provider payload snippet, for debugging only. */
  detail?: unknown;
}

export type PartnerQuoteAdapter = (base: string, quote: string) => Promise<PartnerQuote>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/* --------------------------------- Wise --------------------------------- */

const wiseQuote: PartnerQuoteAdapter = async (base, quote) => {
  try {
    const res = await wiseFetch("/v1/rates", { query: { source: base, target: quote } });
    if (!res.ok) return { ok: false, error: `wise ${res.status}`, detail: res.text.slice(0, 200) };
    const arr = Array.isArray(res.json) ? res.json : [];
    const rate = num((arr[0] as Record<string, unknown> | undefined)?.rate);
    if (!rate) return { ok: false, error: "wise returned no rate" };
    return { ok: true, rate };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/* ----------------------------- Flutterwave ------------------------------ */

const flutterwaveQuote: PartnerQuoteAdapter = async (base, quote) => {
  try {
    // v3 transfer rates: amount is in the destination currency by convention.
    const path =
      `/transfers/rates?amount=1&destination_currency=${quote}&source_currency=${base}`;
    const res = await flwV3Fetch(path, { method: "GET" });
    const data = res.json?.data ?? {};
    // FLW answers "1 destination costs N source" => invert for base->quote.
    const source = num(data?.source?.amount);
    const destination = num(data?.destination?.amount) || 1;
    const direct = num(data?.rate);
    let rate = 0;
    if (source && destination) rate = destination / source;
    else if (direct) rate = direct;
    if (!res.ok || !rate) {
      return { ok: false, error: res.json?.message || `flutterwave ${res.status}` };
    }
    return { ok: true, rate };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/* -------------------------------- Nomba --------------------------------- */

const nombaQuote: PartnerQuoteAdapter = async (base, quote) => {
  try {
    if (!isNombaNigeriaConfigured()) return { ok: false, error: "nomba not configured" };
    // Nomba only quotes NGN pairs.
    if (base !== "NGN" && quote !== "NGN") return { ok: false, error: "nomba quotes NGN pairs only" };
    const { rates, result } = await fetchNombaExchangeRate(base, quote);
    const primary = rates[0];
    const rate = num(primary?.midRateNumeric);
    if (!rate) return { ok: false, error: result.message || "nomba returned no rate" };
    return { ok: true, rate };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/* -------------------------------- Fincra -------------------------------- */

const fincraQuote: PartnerQuoteAdapter = async (base, quote) => {
  try {
    const cfg = getFincraConfig();
    if (!cfg.secretKey) return { ok: false, error: "fincra not configured" };
    if (!cfg.businessId) return { ok: false, error: "FINCRA_BUSINESS_ID missing" };
    const { ok, status, json } = await fincraFetch("/quotes/generate", {
      method: "POST",
      body: JSON.stringify({
        sourceCurrency: base.toUpperCase(),
        destinationCurrency: quote.toUpperCase(),
        amount: "100",
        action: "receive",
        transactionType: "disbursement",
        business: cfg.businessId,
        feeBearer: "business",
        paymentDestination: "bank_account",
        beneficiaryType: "individual",
      }),
    });
    const data = (json?.data ?? json ?? {}) as Record<string, unknown>;
    let rate = num(data.rate);
    const sourceAmount = num(data.sourceAmount ?? data.quotedAmount);
    const destAmount = num(data.destinationAmount ?? data.amountToReceive) || 100;
    if (!rate && sourceAmount) rate = destAmount / sourceAmount;
    if (!ok || !rate) {
      return { ok: false, error: String(json?.message || json?.error || `fincra ${status}`) };
    }
    return { ok: true, rate };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/* ------------------------------- registry ------------------------------- */

/** Partner `code` -> live quote adapter. Partners absent here have no rate API. */
export const PARTNER_QUOTE_ADAPTERS: Record<string, PartnerQuoteAdapter> = {
  wise: wiseQuote,
  flutterwave: flutterwaveQuote,
  nomba: nombaQuote,
  fincra: fincraQuote,
};

export const hasLiveQuotes = (partnerCode: string) =>
  Boolean(PARTNER_QUOTE_ADAPTERS[partnerCode?.toLowerCase?.() ?? ""]);

/** bps the partner keeps versus mid-market. Negative means better than mid. */
export const spreadBps = (partnerRate: number, midRate: number): number | null => {
  if (!(partnerRate > 0) || !(midRate > 0)) return null;
  return Math.round(((midRate - partnerRate) / midRate) * 10_000 * 100) / 100;
};
