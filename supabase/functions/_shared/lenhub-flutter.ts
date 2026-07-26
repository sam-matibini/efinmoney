/**
 * Lenhub Flutterwave wrapper (`/v1/flutterwave/flutter/*` on efincash.lenhub.net).
 * Spec: EfinMoney OpenAPI (`/openapi.json`) — auth session + FLW / Fincra / Payota.
 *
 * Auth: POST /v1/flutterwave/auth/user_api/ with raw API key → Fernet `key`
 * used as `user_key` on every subsequent call (raw API key alone → Unauthorized).
 *
 * Collect: card create → pin → otp → confirm; virtual account
 * Quote / banks / verify / networks
 * Payout: NGN bank FX + unified MoMo (+ Elicate Zambia route)
 *
 * Env:
 *   LENHUB_FLUTTER_API_URL (default https://efincash.lenhub.net)
 *   LENHUB_FLUTTER_USER_KEY / LENHUB_FLUTTER_API_KEY (required for live calls)
 *   LENHUB_FLUTTER_ENABLED=true
 *   LENHUB_FLUTTER_PAYOUT=true
 *   LENHUB_FLUTTER_WEBHOOK_URL (preferred public callback — CF proxy, not supabase.co)
 *   FLW_PROXY_URL / FLW_V4_PROXY_URL (fallback → {proxy}/webhooks/lenhub-flutter)
 */
const DEFAULT_BASE = "https://efincash.lenhub.net";
/** Path prefix for Flutterwave routes (docs OpenAPI). */
const FLW_PREFIX = "/v1/flutterwave/flutter";
const AUTH_PATH = "/v1/flutterwave/auth/user_api/";

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

/**
 * Bank payout destinations in current EfinMoney OpenAPI.
 * Spec only exposes `/payout/exchange/nigeria` (USD/CAD/… → NGN).
 */
export const LENHUB_FLUTTER_BANK_PAYOUT_CURRENCIES = ["NGN"] as const;

/** Source currencies that can fund FX bank / MoMo payouts (USD→CAD FX works; CAD source often Unauthorized). */
export const LENHUB_FLUTTER_PAYOUT_SOURCE_CURRENCIES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "NGN",
] as const;

export const LENHUB_FLUTTER_MOMO_CURRENCIES = ["GHS", "KES", "UGX"] as const;

let cachedSessionKey: string | null = null;
let cachedSessionAt = 0;
const SESSION_TTL_MS = 20_000;

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

/** Raw tenant API key from Lenhub (not the Fernet session token). */
export function getLenhubFlutterApiKey(): string {
  return (
    Deno.env.get("LENHUB_FLUTTER_USER_KEY")?.trim() ||
    Deno.env.get("LENHUB_FLUTTER_API_KEY")?.trim() ||
    ""
  );
}

/**
 * Exchange raw API key for short-lived Fernet `user_key` used on all FLW routes.
 */
export async function lenhubFlutterAuth(force = false): Promise<LenhubFlutterResult & { sessionKey: string | null }> {
  const now = Date.now();
  if (!force && cachedSessionKey && now - cachedSessionAt < SESSION_TTL_MS) {
    return {
      ok: true,
      httpStatus: 200,
      message: "cached",
      json: { status: "success", key: cachedSessionKey },
      raw: "",
      sessionKey: cachedSessionKey,
    };
  }

  const apiKey = getLenhubFlutterApiKey();
  if (!apiKey) {
    const msg = "LENHUB_FLUTTER_USER_KEY (or LENHUB_FLUTTER_API_KEY) is not set";
    return { ok: false, httpStatus: 0, message: msg, json: { error: msg }, raw: msg, sessionKey: null };
  }

  const result = await lenhubFlutterFetchRaw("POST", AUTH_PATH, {
    body: { user_key: apiKey },
    timeoutMs: 20_000,
  });
  const key =
    result.json?.key != null && String(result.json.key).trim()
      ? String(result.json.key).trim()
      : null;
  if (result.ok && key) {
    cachedSessionKey = key;
    cachedSessionAt = Date.now();
  } else {
    cachedSessionKey = null;
    cachedSessionAt = 0;
  }
  return { ...result, ok: result.ok && Boolean(key), sessionKey: key };
}

/**
 * Public callback URL we give Lenhub / pass on card+payout creates.
 * Prefer Cloudflare façade so partners never see a raw supabase.co URL.
 */
export function getLenhubFlutterWebhookUrl(): string {
  const explicit = Deno.env.get("LENHUB_FLUTTER_WEBHOOK_URL")?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const proxy =
    Deno.env.get("FLW_PROXY_URL")?.trim() ||
    Deno.env.get("FLW_V4_PROXY_URL")?.trim() ||
    "https://efin-flw-proxy.ukwenzyb.workers.dev";
  const base = normalizeHost(proxy);
  if (base) return `${base}/webhooks/lenhub-flutter`;

  const projectRef = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1];
  return `https://${projectRef}.supabase.co/functions/v1/lenhub-flutter-webhook`;
}

export function isLenhubFlutterEnabled(): boolean {
  const flag = (Deno.env.get("LENHUB_FLUTTER_ENABLED") || "true").trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") return false;
  return Boolean(getLenhubFlutterBaseUrl()) && Boolean(getLenhubFlutterApiKey());
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

/** Dig into Lenhub/Fincra nested charge payloads for real payment status. */
export function pickLenhubNestedCharge(json: Record<string, unknown>): Record<string, unknown> | null {
  const walk = (obj: unknown, depth = 0): Record<string, unknown> | null => {
    if (!obj || typeof obj !== "object" || depth > 6) return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = walk(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const rec = obj as Record<string, unknown>;
    // Prefer the innermost charge-like object that has payment status / processor_response
    if (rec.processor_response || (rec.id && typeof rec.id === "string" && String(rec.id).startsWith("chg_"))) {
      return rec;
    }
    for (const nest of ["data", "status", "message", "charge", "payment"]) {
      if (rec[nest] != null) {
        const found = walk(rec[nest], depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(json);
}

export function pickLenhubProcessorFailure(json: Record<string, unknown>): {
  chargeStatus: string | null;
  code: string | null;
  type: string | null;
  message: string | null;
} {
  const charge = pickLenhubNestedCharge(json);
  const chargeStatus = charge?.status != null ? String(charge.status).toLowerCase() : null;
  const pr = charge?.processor_response;
  let code: string | null = null;
  let type: string | null = null;
  if (pr && typeof pr === "object" && !Array.isArray(pr)) {
    const p = pr as Record<string, unknown>;
    code = p.code != null ? String(p.code) : null;
    type = p.type != null ? String(p.type) : null;
  }
  let message: string | null = null;
  if (code === "62" || /restricted_service|fraud|restricted/i.test(type || "")) {
    message =
      "Card declined (processor code 62 — restricted / fraud-flagged). Use another card, or ask the bank to unblock international e-commerce.";
  } else if (type || code) {
    message = `Card declined${type ? `: ${type.replace(/_/g, " ")}` : ""}${code ? ` (code ${code})` : ""}`;
  }
  return { chargeStatus, code, type, message };
}

function extractMessage(json: Record<string, unknown>, fallback: string): string {
  const processor = pickLenhubProcessorFailure(json);
  if (processor.message && (processor.chargeStatus === "failed" || processor.code || processor.type)) {
    return processor.message;
  }

  const message = json.message;
  if (typeof message === "string" && message.trim()) {
    const m = message.trim();
    // Lenhub Python KeyError leaked as the message body
    if (m === "'next_action'" || m === "next_action") {
      return "Lenhub card create crashed (missing next_action). Retry — if it keeps failing, ask Lenhub to fix their Flutterwave response parser.";
    }
    return m;
  }
  if (message && typeof message === "object") {
    const m = message as Record<string, unknown>;
    if (typeof m.message === "string" && m.message.trim()) return m.message.trim();
    const status = m.status;
    if (status && typeof status === "object") {
      const s = status as Record<string, unknown>;
      if (typeof s.message === "string" && s.message.trim()) {
        // "Charge updated" with nested failed charge — prefer processor text
        if (processor.message) return processor.message;
        return s.message.trim();
      }
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
  const raw = typeof json.raw === "string" ? json.raw : "";
  if (raw) {
    if (/AESGCM key must be 128, 192, or 256 bits/i.test(raw)) {
      return "Lenhub card encrypt failed (bad Flutterwave encryption key on their server). Bank transfer still works — ask Lenhub to fix AESGCM EncryptionKey.";
    }
    if (/ValueError|Traceback|Internal Server Error|KeyError/i.test(raw)) {
      return "Lenhub card API crashed (HTTP 500). Retry, or ask Lenhub to fix card create.";
    }
  }
  return fallback;
}

function isSuccessEnvelope(json: Record<string, unknown>, httpStatus: number): boolean {
  if (httpStatus < 200 || httpStatus >= 300) return false;
  if (String(json.status || "").toLowerCase() === "error") return false;

  // Lenhub confirm often returns HTTP 200 + "Charge updated" while nested charge.status === "failed"
  const processor = pickLenhubProcessorFailure(json);
  if (processor.chargeStatus === "failed" || processor.chargeStatus === "cancelled") return false;
  if (processor.code || (processor.type && /invalid|declined|fraud|restricted|failed/i.test(processor.type))) {
    return false;
  }

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
      const nestedData = s.data;
      if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
        const nd = nestedData as Record<string, unknown>;
        if (String(nd.status || "").toLowerCase() === "failed") return false;
      }
    }
    if (String(m.status || "").toLowerCase() === "failed") return false;
    if (Array.isArray(m) && m.length === 0) return false;
  }
  return String(json.status || "success").toLowerCase() === "success" || httpStatus < 300;
}

function looksUnauthorized(json: Record<string, unknown>, httpStatus: number): boolean {
  if (httpStatus === 401) return true;
  if (String(json.status) === "401" || Number(json.status) === 401) return true;
  const msg = String(json.message || "").toLowerCase();
  if (msg === "unauthorized" || msg.includes("unauthorized")) return true;
  return false;
}

/** Transient Lenhub/FLW card-create failures worth one fresh-session retry. */
function looksTransientCardCreateFailure(result: LenhubFlutterResult): boolean {
  if (looksUnauthorized(result.json, result.httpStatus)) return true;
  const msg = String(result.message || result.json?.message || "");
  if (msg.includes("'next_action'") || msg.includes("next_action")) return true;
  if (String(result.json?.status || "").toLowerCase() === "error" && /next_action/i.test(msg)) {
    return true;
  }
  const message = result.json?.message;
  if (Array.isArray(message) && message.length === 0) return true;
  return false;
}

/** Low-level fetch with no session injection (used by auth + authenticated wrapper). */
async function lenhubFlutterFetchRaw(
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

/**
 * Authenticated Lenhub call: injects Fernet session as `user_key` into query + body,
 * refreshes once on Unauthorized.
 */
export async function lenhubFlutterFetch(
  method: string,
  path: string,
  opts: {
    query?: Record<string, string | number | undefined | null>;
    body?: Record<string, unknown>;
    timeoutMs?: number;
    /** Skip session (auth endpoint only). */
    skipAuth?: boolean;
  } = {},
): Promise<LenhubFlutterResult> {
  if (opts.skipAuth) {
    return lenhubFlutterFetchRaw(method, path, opts);
  }

  const run = async (forceAuth: boolean): Promise<LenhubFlutterResult> => {
    const auth = await lenhubFlutterAuth(forceAuth);
    if (!auth.sessionKey) {
      return {
        ok: false,
        httpStatus: auth.httpStatus || 401,
        message: auth.message || "Lenhub auth failed",
        json: auth.json,
        raw: auth.raw,
      };
    }
    const query = { ...(opts.query || {}), user_key: auth.sessionKey };
    const body = opts.body ? { ...opts.body, user_key: auth.sessionKey } : undefined;
    return lenhubFlutterFetchRaw(method, path, { ...opts, query, body });
  };

  let result = await run(false);
  if (looksUnauthorized(result.json, result.httpStatus)) {
    cachedSessionKey = null;
    cachedSessionAt = 0;
    result = await run(true);
  }
  return result;
}

export async function lenhubFlutterGetBanks(countryCode: string): Promise<LenhubFlutterResult & { banks: Array<{ id?: string; code: string; name: string }> }> {
  const result = await lenhubFlutterFetch("GET", `${FLW_PREFIX}/bank/code/`, {
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
  const result = await lenhubFlutterFetch("POST", `${FLW_PREFIX}/exchange/rate/`, {
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
  const result = await lenhubFlutterFetch("POST", `${FLW_PREFIX}/verify/bank_account/`, {
    body: {
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
  const result = await lenhubFlutterFetch("GET", `${FLW_PREFIX}/check/mobile/networks/`, {
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
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = pickNestedId(item, keys);
      if (found) return found;
    }
    return null;
  }
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

/** First card-create action hint: pin | otp | additional_fields | redirect | null */
export function pickLenhubCardNextAction(json: Record<string, unknown>): string | null {
  const message = json.message;
  const rows = Array.isArray(message)
    ? message
    : message && typeof message === "object"
    ? [message]
    : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const type = String((row as Record<string, unknown>).type || "").toLowerCase();
    if (type) return type;
  }
  const deep = pickNestedId(json, ["type"]);
  return deep ? deep.toLowerCase() : null;
}

/** 3DS / issuer redirect URL from Lenhub card-create (type: redirect). */
export function pickLenhubCardRedirectUrl(json: Record<string, unknown>): string | null {
  const message = json.message;
  const rows = Array.isArray(message)
    ? message
    : message && typeof message === "object"
    ? [message]
    : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const url = r.url ?? r.redirect_url ?? r.redirectUrl ?? r.authurl ?? r.authUrl;
    if (url != null && String(url).trim().startsWith("http")) return String(url).trim();
  }
  const walk = (obj: unknown): string | null => {
    if (!obj || typeof obj !== "object") return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }
    const rec = obj as Record<string, unknown>;
    for (const k of ["url", "redirect_url", "redirectUrl", "authurl", "authUrl"]) {
      const v = rec[k];
      if (v != null && String(v).trim().startsWith("http")) return String(v).trim();
    }
    for (const nest of ["message", "data", "status"]) {
      const found = walk(rec[nest]);
      if (found) return found;
    }
    return null;
  };
  return walk(json);
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
}): Promise<LenhubFlutterResult & { chargeId: string | null; nextAction: string | null; redirectUrl: string | null }> {
  const attempt = async () => {
    const result = await lenhubFlutterFetch("POST", `${FLW_PREFIX}/card/payment/create/`, {
      body,
      timeoutMs: 45_000,
    });
    const data = unwrapData(result.json) as Record<string, unknown> | null;
    const chargeId =
      pickNestedId(data, ["id", "chargeId", "charge_id", "flw_ref", "tx_ref", "reference"]) ||
      pickNestedId(result.json, ["id", "chargeId", "charge_id", "flw_ref", "tx_ref", "reference"]);
    return {
      ...result,
      chargeId,
      nextAction: pickLenhubCardNextAction(result.json),
      redirectUrl: pickLenhubCardRedirectUrl(result.json),
    };
  };

  let out = await attempt();
  // Lenhub often flakes: KeyError 'next_action', empty message[], or stale Fernet session.
  for (const delayMs of [400, 700]) {
    if (!looksTransientCardCreateFailure(out) && out.chargeId) break;
    if (!looksTransientCardCreateFailure(out)) break;
    cachedSessionKey = null;
    cachedSessionAt = 0;
    await new Promise((r) => setTimeout(r, delayMs));
    out = await attempt();
  }
  return out;
}

export async function lenhubFlutterSendPin(pin: string, chargeId: string): Promise<LenhubFlutterResult> {
  return lenhubFlutterFetch("POST", `${FLW_PREFIX}/complete/payment/pin/`, {
    body: { pin, chargeId },
  });
}

export async function lenhubFlutterSendOtp(otp: string, chargeId: string): Promise<LenhubFlutterResult> {
  return lenhubFlutterFetch("PUT", `${FLW_PREFIX}/complete/payment/otp/`, {
    body: { otp, chargeId },
  });
}

/**
 * AVS / billing address step — matches Lenhub OpenAPI `EfinMoneyfieldschema`
 * and their sample body (user_key injected by lenhubFlutterFetch).
 */
export async function lenhubFlutterConfirmPayment(body: {
  charge_id: string;
  city: string;
  country: string;
  line1: string;
  postal_code: string;
  state: string;
  line2?: string | null;
}): Promise<LenhubFlutterResult> {
  const payload: Record<string, unknown> = {
    charge_id: body.charge_id,
    city: body.city,
    country: body.country,
    line1: body.line1,
    postal_code: body.postal_code,
    state: body.state,
    // Lenhub sample always includes line2 (nullable / empty string OK)
    line2: body.line2 != null && String(body.line2).trim() ? String(body.line2).trim() : "",
  };
  const result = await lenhubFlutterFetch("POST", `${FLW_PREFIX}/confirm_payment/`, { body: payload });
  // Re-evaluate ok using nested charge status (envelope "Charge updated" is not payment success)
  const processor = pickLenhubProcessorFailure(result.json);
  if (processor.chargeStatus === "failed" || processor.code) {
    return {
      ...result,
      ok: false,
      message: processor.message || result.message || "Card payment failed",
    };
  }
  return result;
}

export type LenhubVirtualAccountDetails = {
  accountNumber: string | null;
  accountName: string | null;
  bankName: string | null;
  amount: number | null;
  orderRef: string | null;
  flwRef: string | null;
  currency: string | null;
  expiry: string | null;
};

/** Flatten common Flutterwave / Lenhub VA shapes into a single object. */
export function pickLenhubVirtualAccount(json: Record<string, unknown>): LenhubVirtualAccountDetails {
  const data = (unwrapData(json) || json) as Record<string, unknown>;
  const nested =
    (data?.data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : null) ||
    data;
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = nested?.[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return null;
  };
  const amountRaw = nested?.amount ?? nested?.amountExpected;
  const amount = amountRaw != null && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null;
  // Lenhub/FLW dynamic VA shape (efincash):
  //   account_number, account_bank_name, note (instruction — NOT account name),
  //   account_expiration_datetime, reference, narration
  // Never map `note` → accountName (it is transfer instructions).
  return {
    accountNumber: pick("account_number", "accountNumber", "account"),
    accountName: pick("account_name", "accountName", "account_name_on_bank"),
    bankName: pick(
      "account_bank_name",
      "bank_name",
      "bankName",
      "bank",
      "account_bank",
    ),
    amount,
    orderRef: pick("order_ref", "orderRef", "tx_ref", "txRef", "reference"),
    flwRef: pick("flw_ref", "flwRef", "id"),
    currency: pick("currency", "currency_code")?.toUpperCase() ?? null,
    expiry: pick(
      "account_expiration_datetime",
      "expiry_date",
      "expiryDate",
      "expires_at",
      "note2",
    ),
  };
}

export async function lenhubFlutterCreateVirtualAccount(params: {
  email: string;
  amount: number;
  narration: string;
}): Promise<LenhubFlutterResult & { va: LenhubVirtualAccountDetails }> {
  // OpenAPI CreatevirtualSchema: user_key + amount + email (narration not in schema; kept for ledger notes).
  void params.narration;
  const result = await lenhubFlutterFetch("POST", `${FLW_PREFIX}/create/virtual/account/`, {
    body: {
      email: params.email,
      amount: params.amount,
    },
  });
  return { ...result, va: pickLenhubVirtualAccount(result.json) };
}

function pickProviderRef(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  if (data.id != null) return String(data.id);
  if (data.reference != null) return String(data.reference);
  if (data.flw_ref != null) return String(data.flw_ref);
  return null;
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
  const dest = params.destinationCurrency.toUpperCase();
  if (dest !== "NGN") {
    const msg = `Lenhub EfinMoney OpenAPI only supports NGN bank payout (got ${dest})`;
    return {
      ok: false,
      httpStatus: 400,
      message: msg,
      json: { error: msg, code: "unsupported_bank_corridor" },
      raw: msg,
      providerRef: null,
    };
  }
  // Spec: POST /payout/exchange/nigeria — JSON body, source → NGN
  const result = await lenhubFlutterFetch("POST", `${FLW_PREFIX}/payout/exchange/nigeria`, {
    body: {
      amount: params.amount,
      source_currency: params.sourceCurrency.toUpperCase(),
      bank_code: params.bankCode,
      account_number: params.accountNumber,
      callback_url: params.callbackUrl,
      narration: params.narration.slice(0, 180),
    },
    timeoutMs: 45_000,
  });
  const data = unwrapData(result.json) as Record<string, unknown> | null;
  return { ...result, providerRef: pickProviderRef(data) };
}

async function lenhubFlutterMomoTransfer(
  currency: "GHS" | "KES" | "UGX",
  params: {
    amount: number;
    msisdn: string;
    firstName: string;
    lastName: string;
    network: string;
    sourceCurrency: string;
    narration: string;
  },
): Promise<LenhubFlutterResult & { providerRef: string | null }> {
  const result = await lenhubFlutterFetch("POST", `${FLW_PREFIX}/mobile/money/transfer/`, {
    body: {
      amount: params.amount,
      currency,
      number: params.msisdn.replace(/\D/g, ""),
      first_name: params.firstName,
      last_name: params.lastName,
      network: params.network,
      source_currency: params.sourceCurrency.toUpperCase(),
      narration: params.narration.slice(0, 180),
    },
    timeoutMs: 45_000,
  });
  const data = unwrapData(result.json) as Record<string, unknown> | null;
  return { ...result, providerRef: pickProviderRef(data) };
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
  return lenhubFlutterMomoTransfer("GHS", params);
}

export async function lenhubFlutterKenyaMomoPayout(params: {
  amount: number;
  msisdn: string;
  firstName: string;
  lastName: string;
  network: string;
  sourceCurrency: string;
  narration: string;
}): Promise<LenhubFlutterResult & { providerRef: string | null }> {
  return lenhubFlutterMomoTransfer("KES", params);
}

export async function lenhubFlutterUgandaMomoPayout(params: {
  amount: number;
  msisdn: string;
  firstName: string;
  lastName: string;
  network: string;
  sourceCurrency: string;
  narration: string;
}): Promise<LenhubFlutterResult & { providerRef: string | null }> {
  return lenhubFlutterMomoTransfer("UGX", params);
}

/** Elicate Zambia MoMo via Lenhub (`/v1/elicate/flutter/zambia/payout/`). */
export async function lenhubElicateZambiaPayout(params: {
  amount: number;
  accountType: string;
  accountNumber: string;
  fullname: string;
  narrative: string;
}): Promise<LenhubFlutterResult & { providerRef: string | null }> {
  const result = await lenhubFlutterFetch("POST", "/v1/elicate/flutter/zambia/payout/", {
    query: {
      amount: params.amount,
      account_type: params.accountType,
      account_number: params.accountNumber,
      fullname: params.fullname,
      narrative: params.narrative.slice(0, 180),
    },
    timeoutMs: 45_000,
  });
  const data = unwrapData(result.json) as Record<string, unknown> | null;
  return { ...result, providerRef: pickProviderRef(data) };
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
