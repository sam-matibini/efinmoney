/**
 * Verto FX / Payments client for eFinMoney corporate partner clearing.
 * Docs: https://docs.verto.co/
 *
 * Auth: POST /users/login with clientId + apiKey (JWT, 60 min).
 * Wallets, FX quote/book, V-Pay (WALLET_TO_BUSINESS) and WALLET_PAYOUT.
 *
 * Secrets: VERTO_CLIENT_ID, VERTO_API_KEY, optional VERTO_ENV=sandbox|production,
 * VERTO_COMPANY_ID, VERTO_PURPOSE_ID, and per-service *_BASE overrides.
 */
export type VertoEnv = "sandbox" | "production";

export type VertoWallet = {
  id: string;
  currency: string;
  available: number;
  ledger: number;
  label: string | null;
  isDefault: boolean;
};

export type VertoQuote = {
  rate: number;
  vfxToken: string;
  expiry: string | null;
};

export type VertoFetchResult = {
  ok: boolean;
  status: number;
  json: Record<string, unknown>;
  text: string;
};

const SANDBOX = {
  company: "https://api-company-sandbox.vertofx.com",
  wallet: "https://api-wallet-sandbox.vertofx.com",
  exchange: "https://api-exchange-now-sandbox.vertofx.com",
  payment: "https://api-payment-sandbox.vertofx.com",
  beneficiary: "https://api-beneficiary-sandbox.vertofx.com",
};

const PRODUCTION = {
  company: "https://api-company-beta.vertofx.com",
  wallet: "https://api-wallet-beta.vertofx.com",
  exchange: "https://api-exchange-now-beta.vertofx.com",
  payment: "https://api-payment-beta.vertofx.com",
  beneficiary: "https://api-beneficiary-beta.vertofx.com",
};

type Hosts = typeof SANDBOX;

let cachedToken: { jwt: string; companyId: string; exp: number } | null = null;

export function getVertoConfig() {
  const raw = (Deno.env.get("VERTO_ENV") || "sandbox").trim().toLowerCase();
  const env: VertoEnv = ["live", "production", "prod", "beta"].includes(raw) ? "production" : "sandbox";
  const hosts: Hosts = env === "production" ? PRODUCTION : SANDBOX;
  return {
    env,
    clientId: Deno.env.get("VERTO_CLIENT_ID")?.trim() || "",
    apiKey: Deno.env.get("VERTO_API_KEY")?.trim() || "",
    companyIdOverride: Deno.env.get("VERTO_COMPANY_ID")?.trim() || "",
    purposeId: Deno.env.get("VERTO_PURPOSE_ID")?.trim() || "1",
    hosts: {
      company: (Deno.env.get("VERTO_COMPANY_BASE") || hosts.company).replace(/\/+$/, ""),
      wallet: (Deno.env.get("VERTO_WALLET_BASE") || hosts.wallet).replace(/\/+$/, ""),
      exchange: (Deno.env.get("VERTO_EXCHANGE_BASE") || hosts.exchange).replace(/\/+$/, ""),
      payment: (Deno.env.get("VERTO_PAYMENT_BASE") || hosts.payment).replace(/\/+$/, ""),
      beneficiary: (Deno.env.get("VERTO_BENEFICIARY_BASE") || hosts.beneficiary).replace(/\/+$/, ""),
    },
  };
}

export function vertoConfigured() {
  const cfg = getVertoConfig();
  return Boolean(cfg.clientId && cfg.apiKey);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function pickNumber(...values: unknown[]): number {
  for (const v of values) {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

async function vertoFetch(
  base: string,
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<VertoFetchResult> {
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(url, {
    method: opts.method || (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body == null ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    const parsed = text ? JSON.parse(text) : {};
    json = Array.isArray(parsed) ? { data: parsed } : asRecord(parsed);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, json, text };
}

export async function vertoLogin(force = false) {
  const cfg = getVertoConfig();
  if (!cfg.clientId || !cfg.apiKey) throw new Error("VERTO_CLIENT_ID and VERTO_API_KEY are required");
  if (!force && cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken;

  const res = await vertoFetch(cfg.hosts.company, "/users/login", {
    method: "POST",
    body: { clientId: cfg.clientId, apiKey: cfg.apiKey, mode: "apiKey" },
  });
  if (!res.ok) {
    throw new Error(pickString(res.json.message, res.json.error, `Verto login failed (${res.status})`));
  }
  const jwt = pickString(res.json.jwt, res.json.token, asRecord(res.json.data).jwt, asRecord(res.json.data).token);
  const companyId = pickString(
    cfg.companyIdOverride,
    res.json.companyId,
    asRecord(res.json.data).companyId,
  );
  if (!jwt) throw new Error("Verto login did not return a JWT");
  cachedToken = { jwt, companyId, exp: Date.now() + 50 * 60_000 };
  return cachedToken;
}

async function authed(base: string, path: string, opts: { method?: string; body?: unknown } = {}) {
  const session = await vertoLogin();
  let res = await vertoFetch(base, path, { ...opts, token: session.jwt });
  if (res.status === 401) {
    const retry = await vertoLogin(true);
    res = await vertoFetch(base, path, { ...opts, token: retry.jwt });
  }
  return res;
}

function walletFromRaw(raw: Record<string, unknown>): VertoWallet | null {
  const id = pickString(raw.id, raw.walletId, raw.wallet_id);
  const currency = pickString(
    raw.currency,
    raw.currencyCode,
    raw.currency_code,
    asRecord(raw.currency).currencyName,
    asRecord(raw.currency).code,
  ).toUpperCase();
  if (!id || !currency) return null;
  const available = pickNumber(
    raw.availableBalance,
    raw.available,
    raw.balance,
    asRecord(raw.availableBalance).value,
    asRecord(raw.balance).available,
  );
  const ledger = pickNumber(raw.ledgerBalance, raw.ledger, asRecord(raw.balance).ledger, available);
  return {
    id: String(id),
    currency,
    available,
    ledger,
    label: pickString(raw.customerReferenceLabel, raw.label, raw.nickname) || null,
    isDefault: Boolean(raw.isDefault ?? raw.default ?? false),
  };
}

export async function listVertoWallets(): Promise<VertoWallet[]> {
  const cfg = getVertoConfig();
  const session = await vertoLogin();
  const companyId = session.companyId || cfg.companyIdOverride;
  if (!companyId) throw new Error("Verto companyId missing — set VERTO_COMPANY_ID or re-login");
  const res = await authed(cfg.hosts.wallet, `/${encodeURIComponent(companyId)}/wallets`);
  if (!res.ok) throw new Error(pickString(res.json.message, `List wallets failed (${res.status})`));
  const rows = Array.isArray(res.json.data)
    ? (res.json.data as unknown[])
    : Array.isArray(res.json.wallets)
    ? (res.json.wallets as unknown[])
    : Array.isArray(res.json)
    ? (res.json as unknown[])
    : [];
  return rows.map((row) => walletFromRaw(asRecord(row))).filter((w): w is VertoWallet => Boolean(w));
}

export async function quoteVertoFx(from: string, to: string, paymentMode: "immediate" | "later" = "immediate"): Promise<VertoQuote> {
  const cfg = getVertoConfig();
  const res = await authed(cfg.hosts.exchange, "/fx/rate", {
    method: "POST",
    body: {
      paymentMode,
      currencyFrom: { currencyName: from.toUpperCase() },
      currencyTo: { currencyName: to.toUpperCase() },
    },
  });
  if (!res.ok) throw new Error(pickString(res.json.message, `FX quote failed (${res.status})`));
  const token = pickString(res.json.vfx_token, res.json.vfxToken, res.json.vfx_Token);
  const rate = pickNumber(res.json.rate);
  if (!token || !rate) throw new Error("Verto FX quote missing rate or vfx_token");
  return { rate, vfxToken: token, expiry: pickString(res.json.expiry) || null };
}

export async function bookVertoFx(input: {
  sourceWalletId: string;
  targetWalletId: string;
  sourceAmount: number;
  vfxToken: string;
  paymentId?: string;
  reference?: string;
}) {
  const cfg = getVertoConfig();
  const paymentId = input.paymentId || crypto.randomUUID();
  const res = await authed(cfg.hosts.exchange, "/fx/payments", {
    method: "POST",
    body: {
      paymentType: "convertWithinWallets",
      sourceWalletId: String(input.sourceWalletId),
      sourceAmount: input.sourceAmount,
      targetWalletId: String(input.targetWalletId),
      vfx_Token: input.vfxToken,
      vfxToken: input.vfxToken,
      customPaymentReference: input.reference || `efinmoney-fx-${paymentId}`,
      paymentId,
    },
  });
  if (!res.ok) throw new Error(pickString(res.json.message, `FX book failed (${res.status})`));
  return { paymentId, raw: res.json };
}

export async function sendVertoToBusiness(input: {
  sourceWalletId: string;
  sourceAmount: number;
  targetCompanyId: string;
  purposeId?: string;
  paymentId?: string;
  reference?: string;
}) {
  const cfg = getVertoConfig();
  const paymentId = input.paymentId || crypto.randomUUID();
  const res = await authed(cfg.hosts.payment, "/payments/create", {
    method: "POST",
    body: {
      paymentType: "WALLET_TO_BUSINESS",
      sourceWalletId: String(input.sourceWalletId),
      sourceAmount: input.sourceAmount,
      targetCompanyId: String(input.targetCompanyId),
      purposeId: String(input.purposeId || cfg.purposeId),
      customPaymentReference: input.reference || `efinmoney-vpay-${paymentId}`,
      paymentId,
    },
  });
  if (!res.ok) throw new Error(pickString(res.json.message, `V-Pay failed (${res.status})`));
  return { paymentId, status: pickString(res.json.status, "requested"), raw: res.json };
}

export async function sendVertoPayout(input: {
  sourceWalletId: string;
  sourceAmount: number;
  targetAccountId: string;
  purposeId?: string;
  paymentId?: string;
  reference?: string;
  sender?: Record<string, unknown>;
}) {
  const cfg = getVertoConfig();
  const paymentId = input.paymentId || crypto.randomUUID();
  const body: Record<string, unknown> = {
    paymentType: "WALLET_PAYOUT",
    sourceWalletId: String(input.sourceWalletId),
    sourceAmount: input.sourceAmount,
    targetAccountId: String(input.targetAccountId),
    purposeId: String(input.purposeId || cfg.purposeId),
    customPaymentReference: input.reference || `efinmoney-payout-${paymentId}`,
    paymentId,
  };
  if (input.sender) body.sender = input.sender;
  const res = await authed(cfg.hosts.payment, "/payments/create", {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error(pickString(res.json.message, `Payout failed (${res.status})`));
  return { paymentId, status: pickString(res.json.status, "requested"), raw: res.json };
}

export async function getVertoPayment(paymentId: string) {
  const cfg = getVertoConfig();
  const res = await authed(cfg.hosts.payment, `/payments/${encodeURIComponent(paymentId)}`);
  return { ok: res.ok, status: res.status, json: res.json };
}

/** Indicative CAD-centric mock rates used when Verto credentials are not set. */
export const MOCK_RATES: Record<string, number> = {
  "CAD-USD": 0.73,
  "USD-CAD": 1.37,
  "CAD-EUR": 0.67,
  "EUR-CAD": 1.49,
  "CAD-GBP": 0.58,
  "GBP-CAD": 1.72,
  "USD-EUR": 0.92,
  "EUR-USD": 1.09,
  "USD-GBP": 0.79,
  "GBP-USD": 1.27,
  "USD-NGN": 1550,
  "NGN-USD": 0.000645,
  "CAD-NGN": 1130,
  "NGN-CAD": 0.000885,
  "USD-GHS": 15.4,
  "GHS-USD": 0.065,
  "USD-KES": 129,
  "KES-USD": 0.00775,
  "USD-ZAR": 18.2,
  "ZAR-USD": 0.055,
};

export function mockRate(from: string, to: string) {
  const key = `${from.toUpperCase()}-${to.toUpperCase()}`;
  if (MOCK_RATES[key]) return MOCK_RATES[key];
  if (from.toUpperCase() === to.toUpperCase()) return 1;
  return 1;
}

export const MOCK_WALLETS: VertoWallet[] = [
  { id: "mock-cad", currency: "CAD", available: 250_000, ledger: 250_000, label: "Corporate CAD", isDefault: true },
  { id: "mock-usd", currency: "USD", available: 180_000, ledger: 180_000, label: "Corporate USD", isDefault: true },
  { id: "mock-eur", currency: "EUR", available: 90_000, ledger: 90_000, label: "Corporate EUR", isDefault: true },
  { id: "mock-gbp", currency: "GBP", available: 70_000, ledger: 70_000, label: "Corporate GBP", isDefault: true },
  { id: "mock-ngn", currency: "NGN", available: 85_000_000, ledger: 85_000_000, label: "Partner NGN", isDefault: true },
];
