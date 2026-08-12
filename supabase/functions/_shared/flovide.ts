/**
 * Flovide (OhentPay) REST API — https://flovide.com/developer
 *
 * Secrets:
 *   FLOVIDE_PUBLIC_KEY   (pk_live_… / pk_test_…)
 *   FLOVIDE_SECRET_KEY   (sk_live_… / sk_test_…)
 *   FLOVIDE_ENV          live | test (default live)
 *   FLOVIDE_API_BASE     optional override (default https://flovide.com)
 *   FLOVIDE_WEBHOOK_SECRET optional
 */

export type FlovideConfig = {
  publicKey: string;
  secretKey: string;
  apiBase: string;
  environment: "live" | "test";
};

export function getFlovideConfig(): FlovideConfig {
  const environment = (Deno.env.get("FLOVIDE_ENV") || "live").trim().toLowerCase() === "test"
    ? "test"
    : "live";
  const apiBase = (Deno.env.get("FLOVIDE_API_BASE") || "https://flovide.com").trim().replace(/\/+$/, "");
  return {
    publicKey: (Deno.env.get("FLOVIDE_PUBLIC_KEY") || "").trim(),
    secretKey: (Deno.env.get("FLOVIDE_SECRET_KEY") || "").trim(),
    apiBase,
    environment,
  };
}

export function flovideConfigured(cfg = getFlovideConfig()): boolean {
  return !!(cfg.publicKey && cfg.secretKey);
}

export async function flovideFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; json: any; raw: string }> {
  const cfg = getFlovideConfig();
  if (!flovideConfigured(cfg)) {
    return { ok: false, status: 0, json: { message: "Flovide not configured" }, raw: "" };
  }
  const url = `${cfg.apiBase}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Public-Key": cfg.publicKey,
    "X-Secret-Key": cfg.secretKey,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(url, { ...init, headers });
  const raw = await res.text();
  let json: any = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { raw };
  }
  const ok = res.ok && json?.success !== false;
  return { ok, status: res.status, json, raw };
}

export async function flovideListBalances(currency?: string) {
  const q = currency ? `?currency=${encodeURIComponent(currency)}` : "";
  return flovideFetch(`/api/v1/balances${q}`);
}

export async function flovideListCurrencies() {
  return flovideFetch("/api/v1/reference-data/currencies");
}

export async function flovideListBanks(countryIso?: string, currency?: string) {
  const params = new URLSearchParams();
  if (countryIso) params.set("country_iso", countryIso);
  if (currency) params.set("currency", currency);
  const q = params.toString() ? `?${params}` : "";
  return flovideFetch(`/api/v1/reference-data/banks${q}`);
}

export async function flovideGetRates(from: string, to: string, amount?: number) {
  const params = new URLSearchParams({
    from_currency: from.toUpperCase(),
    to_currency: to.toUpperCase(),
  });
  if (amount != null && Number.isFinite(amount)) params.set("amount", String(amount));
  return flovideFetch(`/api/v1/rates?${params}`);
}

export async function flovideCreateInteracCollection(amount: number, email: string) {
  return flovideFetch("/api/v1/collections/interac", {
    method: "POST",
    body: JSON.stringify({ amount, email }),
  });
}

/** Probe undocumented paths (virtual accounts / other collections). */
export async function flovideProbePath(path: string, init: RequestInit = {}) {
  return flovideFetch(path, init);
}

export async function flovideAccountInquiry(params: {
  currency: string;
  bank_code: string;
  account_number: string;
}) {
  return flovideFetch("/api/v1/beneficiaries/account-inquiry", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function flovideCreateBeneficiary(body: Record<string, unknown>) {
  return flovideFetch("/api/v1/beneficiaries", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function flovideCreateTransaction(body: Record<string, unknown>) {
  return flovideFetch("/api/v1/transactions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function flovideListTransactions(params?: Record<string, string>) {
  const q = params && Object.keys(params).length
    ? `?${new URLSearchParams(params)}`
    : "";
  return flovideFetch(`/api/v1/transactions${q}`);
}

export async function flovideGetTransaction(id: string) {
  return flovideFetch(`/api/v1/transactions/${encodeURIComponent(id)}`);
}

export function flovideTxnStatus(raw: Record<string, unknown>): string {
  return String(raw.status ?? raw.transaction_status ?? "").toLowerCase();
}

export function isFlovideTxnSuccess(status: string): boolean {
  return ["success", "successful", "completed", "paid", "settled", "processed", "credited"].includes(status);
}

export function isFlovideTxnFailure(status: string): boolean {
  return ["failed", "failure", "declined", "rejected", "cancelled", "canceled", "expired"].includes(status);
}
