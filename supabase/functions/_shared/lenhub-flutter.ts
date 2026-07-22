/**
 * Lenhub Flutterwave wrapper (`/app/flutter/*` on mtn.lenhub.net).
 * Spec: Efin-Projects/flutter.json
 *
 * Collect: card create → pin → otp → confirm; virtual account
 * Quote / banks / verify / networks
 * Payout: bank FX (`payout/exchange`) + Ghana MoMo
 *
 * Env:
 *   LENHUB_FLUTTER_API_URL (default https://mtn.lenhub.net)
 *   LENHUB_FLUTTER_ENABLED=true
 *   LENHUB_FLUTTER_PAYOUT=true
 */
const DEFAULT_BASE = "https://mtn.lenhub.net";

/** Currencies we offer for card/VA top-up via this rail (API accepts free-form currency). */
export const LENHUB_FLUTTER_COLLECT_CURRENCIES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "NGN",
  "GHS",
  "KES",
  "UGX",
  "RWF",
  "TZS",
] as const;

/** Bank list country codes that have returned data in live probes. */
export const LENHUB_FLUTTER_BANK_COUNTRIES = ["NG", "GH", "KE"] as const;

/** Destination currencies for bank payout/exchange (matched to FX probes). */
export const LENHUB_FLUTTER_BANK_PAYOUT_CURRENCIES = [
  "NGN",
  "GHS",
  "KES",
  "UGX",
  "RWF",
  "TZS",
  "ZMW",
] as const;

/** Source currencies that can fund FX bank / Ghana MoMo payouts. */
export const LENHUB_FLUTTER_PAYOUT_SOURCE_CURRENCIES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "NGN",
] as const;

export const LENHUB_FLUTTER_MOMO_CURRENCIES = ["GHS"] as const;

export type LenhubFlutterResult = {
  ok: boolean;
  httpStatus: number;
  message: string;
  json: Record<string, unknown>;
  raw: string;
};

function normalizeHost(raw: string): string {
  let u = raw.trim().replace(/\/+$/, "");
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return u;
  }
}

export function getLenhubFlutterBaseUrl(): string {
  return normalizeHost(Deno.env.get("LENHUB_FLUTTER_API_URL")?.trim() || DEFAULT_BASE);
}

export function isLenhubFlutterEnabled(): boolean {
  const flag = (Deno.env.get("LENHUB_FLUTTER_ENABLED") || "true").trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  return Boolean(getLenhubFlutterBaseUrl());
}

export function isLenhubFlutterPayoutEnabled(): boolean {
  if (!isLenhubFlutterEnabled()) return false;
  const flag = (Deno.env.get("LENHUB_FLUTTER_PAYOUT") || "true").trim().toLowerCase();
  return !(flag === "false" || flag === "0" || flag === "off");
}

export function currencyToBankCountry(currency: string): string {
  const c = currency.toUpperCase();
  const map: Record<string, string> = {
    NGN: "NG",
    GHS: "GH",
    KES: "KE",
    UGX: "UG",
    TZS: "TZ",
    RWF: "RW",
    ZMW: "ZM",
    USD: "US",
    CAD: "CA",
    GBP: "GB",
    EUR: "EU",
  };
  return map[c] || c.slice(0, 2);
}

function unwrapData(json: Record<string, unknown>): unknown {
  const message = json.message;
  if (message && typeof message === "object") {
    const m = message as Record<string, unknown>;
    if (m.data !== undefined) return m.data;
    const inner = m.status;
    if (inner && typeof inner === "object") {
      const s = inner as Record<string, unknown>;
      if (s.data !== undefined) return s.data;
      if (s.error !== undefined) return s;
    }
    if (m.statusCode !== undefined) return m;
  }
  if (json.data !== undefined) return json.data;
  return json;
}

function extractMessage(json: Record<string, unknown>, fallback: string): string {
  const message = json.message;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (message && typeof message === "object") {
    const m = message as Record<string, unknown>;
    if (typeof m.message === "string" && m.message.trim()) return m.message.trim();
    const status = m.status;
    if (status && typeof status === "object") {
      const s = status as Record<string, unknown>;
      if (typeof s.message === "string" && s.message.trim()) return s.message.trim();
      const err = s.error;
      if (err && typeof err === "object") {
        const e = err as Record<string, unknown>;
        if (typeof e.message === "string") return e.message;
      }
      if (typeof err === "string") return err;
    }
    if (typeof m.error === "string") return m.error;
  }
  if (typeof json.error === "string") return json.error;
  return fallback;
}

function isSuccessEnvelope(json: Record<string, unknown>, httpStatus: number): boolean {
  if (httpStatus < 200 || httpStatus >= 300) return false;
  if (String(json.status || "").toLowerCase() === "error") return false;
  const message = json.message;
  // Lenhub sometimes returns { status: "success", message: [] } with no real payload
  if (Array.isArray(message) && message.length === 0) return false;
  if (message && typeof message === "object") {
    const m = message as Record<string, unknown>;
    if (Number(m.statusCode) === 401) return false;
    const status = m.status;
    if (status && typeof status === "object") {
      const s = status as Record<string, unknown>;
      if (String(s.status || "").toLowerCase() === "failed") return false;
      if (s.error) return false;
    }
    if (String(m.status || "").toLowerCase() === "failed") return false;
    if (Array.isArray(m) && m.length === 0) return false;
  }
  return String(json.status || "success").toLowerCase() === "success" || httpStatus < 300;
}

export async function lenhubFlutterFetch(
  method: string,
  path: string,
  opts: {
    query?: Record<string, string | number | undefined | null>;
    body?: Record<string, unknown>;
    timeoutMs?: number;
  } = {},
): Promise<LenhubFlutterResult> {
  const base = getLenhubFlutterBaseUrl();
  const url = new URL(path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = { method: method.toUpperCase(), headers };
  if (opts.body) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(1000, opts.timeoutMs ?? 30_000));
  try {
    const res = await fetch(url.toString(), { ...init, signal: ctrl.signal });
    clearTimeout(t);
    const raw = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      json = { raw };
    }
    const ok = isSuccessEnvelope(json, res.status);
    return {
      ok,
      httpStatus: res.status,
      message: extractMessage(json, ok ? "OK" : `HTTP ${res.status}`),
      json,
      raw,
    };
  } catch (err) {
    clearTimeout(t);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, httpStatus: 0, message: msg, json: { error: msg }, raw: msg };
  }
}

export async function lenhubFlutterGetBanks(countryCode: string): Promise<LenhubFlutterResult & { banks: Array<{ id?: string; code: string; name: string }> }> {
  const result = await lenhubFlutterFetch("GET", "/app/flutter/bank/code/", {
    query: { country_code: countryCode.toUpperCase() },
  });
  const data = unwrapData(result.json);
  const list = Array.isArray(data) ? data : [];
  const banks = list
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id != null ? String(r.id) : undefined,
        code: String(r.code ?? "").trim(),
        name: String(r.name ?? "").trim(),
      };
    })
    .filter((b) => b.code && b.name);
  return { ...result, ok: result.ok && banks.length > 0, banks };
}

export async function lenhubFlutterExchangeRate(params: {
  sourceCurrency: string;
  destinationCurrency: string;
  amount: number;
}): Promise<LenhubFlutterResult & { rate: number | null; rateId: string | null; sourceAmount: number | null; destAmount: number | null }> {
  const result = await lenhubFlutterFetch("POST", "/app/flutter/exchange/rate/", {
    query: {
      source_currency: params.sourceCurrency.toUpperCase(),
      destination_currency: params.destinationCurrency.toUpperCase(),
      amount: params.amount,
    },
  });
  const data = unwrapData(result.json) as Record<string, unknown> | null;
  const rate = data?.rate != null ? Number(data.rate) : null;
  const rateId = data?.id != null ? String(data.id) : null;
  const source = (data?.source || {}) as Record<string, unknown>;
  const dest = (data?.destination || {}) as Record<string, unknown>;
  return {
    ...result,
    rate: Number.isFinite(rate as number) ? rate : null,
    rateId,
    sourceAmount: source.amount != null ? Number(source.amount) : null,
    destAmount: dest.amount != null ? Number(dest.amount) : null,
  };
}

export async function lenhubFlutterVerifyAccount(params: {
  accountNumber: string;
  currency: string;
  bankCode: string;
}): Promise<LenhubFlutterResult & { accountName: string | null }> {
  const result = await lenhubFlutterFetch("POST", "/app/flutter/verify/account/", {
    query: {
      account_number: params.accountNumber,
      currency: params.currency.toUpperCase(),
      bank_code: params.bankCode,
    },
  });
  const data = unwrapData(result.json) as Record<string, unknown> | null;
  const accountName =
    (data && (data.account_name || data.accountName || data.name)) != null
      ? String(data.account_name || data.accountName || data.name)
      : null;
  return { ...result, accountName };
}

export async function lenhubFlutterNetworks(country: string): Promise<LenhubFlutterResult & { networks: Array<{ id?: string; network: string; name: string }> }> {
  const result = await lenhubFlutterFetch("POST", "/app/flutter/create/customer/", {
    query: { country: country.toUpperCase() },
  });
  const data = unwrapData(result.json);
  const list = Array.isArray(data) ? data : [];
  const networks = list
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id != null ? String(r.id) : undefined,
        network: String(r.network ?? "").trim(),
        name: String(r.name ?? r.network ?? "").trim(),
      };
    })
    .filter((n) => n.network);
  return { ...result, ok: result.ok && networks.length > 0, networks };
}

function pickNestedId(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    if (rec[k] != null && String(rec[k]).trim()) return String(rec[k]).trim();
  }
  for (const nest of ["data", "message", "status", "payment", "charge"]) {
    if (rec[nest] && typeof rec[nest] === "object") {
      const found = pickNestedId(rec[nest], keys);
      if (found) return found;
    }
  }
  return null;
}

export async function lenhubFlutterCreateCardPayment(body: {
  card_number: string;
  expiry_date_month: string;
  expiry_date_year: string;
  cvv: string;
  amount: number;
  callback: string;
  email: string;
  currency: string;
}): Promise<LenhubFlutterResult & { chargeId: string | null }> {
  const result = await lenhubFlutterFetch("POST", "/app/flutter/card/payment/create/", { body, timeoutMs: 45_000 });
  const data = unwrapData(result.json) as Record<string, unknown> | null;
  const chargeId =
    pickNestedId(data, ["id", "chargeId", "charge_id", "flw_ref", "tx_ref", "reference"]) ||
    pickNestedId(result.json, ["id", "chargeId", "charge_id", "flw_ref", "tx_ref", "reference"]);
  return { ...result, chargeId };
}

export async function lenhubFlutterSendPin(pin: string, chargeId: string): Promise<LenhubFlutterResult> {
  return lenhubFlutterFetch("POST", "/app/flutter/complete/payment/pin/", {
    body: { pin, chargeId },
  });
}

export async function lenhubFlutterSendOtp(otp: string, chargeId: string): Promise<LenhubFlutterResult> {
  return lenhubFlutterFetch("PUT", "/app/flutter/complete/payment/otp/", {
    body: { otp, chargeId },
  });
}

export async function lenhubFlutterConfirmPayment(body: {
  charge_id: string;
  city: string;
  country: string;
  line1: string;
  postal_code: string;
  state: string;
  line2?: string | null;
}): Promise<LenhubFlutterResult> {
  return lenhubFlutterFetch("POST", "/app/flutter/confirm_payment/", { body });
}

export async function lenhubFlutterCreateVirtualAccount(params: {
  email: string;
  amount: number;
  narration: string;
}): Promise<LenhubFlutterResult> {
  return lenhubFlutterFetch("POST", "/app/flutter/create/virtual/account/", {
    query: {
      email: params.email,
      amount: params.amount,
      narration: params.narration,
    },
  });
}

export async function lenhubFlutterBankPayout(params: {
  amount: number;
  sourceCurrency: string;
  destinationCurrency: string;
  bankCode: string;
  accountNumber: string;
  callbackUrl: string;
  narration: string;
}): Promise<LenhubFlutterResult & { providerRef: string | null }> {
  const result = await lenhubFlutterFetch("POST", "/app/flutter/payout/exchange/", {
    query: {
      amount: params.amount,
      source_currency: params.sourceCurrency.toUpperCase(),
      destination_currency: params.destinationCurrency.toUpperCase(),
      bank_code: params.bankCode,
      account_number: params.accountNumber,
      callback_url: params.callbackUrl,
      narration: params.narration.slice(0, 180),
    },
    timeoutMs: 45_000,
  });
  const data = unwrapData(result.json) as Record<string, unknown> | null;
  const providerRef =
    data?.id != null
      ? String(data.id)
      : data?.reference != null
      ? String(data.reference)
      : data?.flw_ref != null
      ? String(data.flw_ref)
      : null;
  return { ...result, providerRef };
}

export async function lenhubFlutterGhanaMomoPayout(params: {
  amount: number;
  msisdn: string;
  firstName: string;
  lastName: string;
  network: string;
  sourceCurrency: string;
  narration: string;
}): Promise<LenhubFlutterResult & { providerRef: string | null }> {
  const result = await lenhubFlutterFetch("POST", "/app/flutter/ghana/mobile/money/transfer/", {
    query: {
      amount: params.amount,
      msisdn: params.msisdn.replace(/\D/g, ""),
      first_name: params.firstName,
      last_name: params.lastName,
      network: params.network,
      source_currency: params.sourceCurrency.toUpperCase(),
      narration: params.narration.slice(0, 180),
    },
    timeoutMs: 45_000,
  });
  const data = unwrapData(result.json) as Record<string, unknown> | null;
  const providerRef =
    data?.id != null
      ? String(data.id)
      : data?.reference != null
      ? String(data.reference)
      : null;
  return { ...result, providerRef };
}

export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "eFin", last: "User" };
  if (parts.length === 1) return { first: parts[0], last: "User" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function resolveGhanaMomoNetwork(raw: string): string {
  const n = raw.trim().toUpperCase().replace(/[\s_-]+/g, "");
  if (n.includes("AIRTELTIGO") || n === "AIR" || n === "ATL") return "AIRTELTIGO";
  if (n.includes("VODA") || n.includes("TELECEL") || n === "VOD") return "VODAFONE";
  return "MTN";
}

export function supportsLenhubFlutterBankPayout(destCurrency: string): boolean {
  return (LENHUB_FLUTTER_BANK_PAYOUT_CURRENCIES as readonly string[]).includes(destCurrency.toUpperCase());
}

export function supportsLenhubFlutterMomoPayout(destCurrency: string): boolean {
  return (LENHUB_FLUTTER_MOMO_CURRENCIES as readonly string[]).includes(destCurrency.toUpperCase());
}

export function supportsLenhubFlutterCollect(currency: string): boolean {
  return (LENHUB_FLUTTER_COLLECT_CURRENCIES as readonly string[]).includes(currency.toUpperCase());
}
