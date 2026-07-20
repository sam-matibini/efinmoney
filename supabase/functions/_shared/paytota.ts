/**
 * Paytota Paygateway — hosted card / purchase collection.
 * Docs: https://docs.paytota.com/payments/cards-1/card-collection
 * Base: https://gate.paytota.com
 */

const DEFAULT_BASE = "https://gate.paytota.com";

export type PaytotaConfig = {
  baseUrl: string;
  secretKey: string;
  brandId: string;
};

export function getPaytotaConfig(): PaytotaConfig {
  return {
    baseUrl: (Deno.env.get("PAYTOTA_BASE_URL")?.trim() || DEFAULT_BASE).replace(/\/+$/, ""),
    secretKey: Deno.env.get("PAYTOTA_SECRET_KEY")?.trim() || "",
    brandId: Deno.env.get("PAYTOTA_BRAND_ID")?.trim() || "",
  };
}

export function isPaytotaConfigured(): boolean {
  const cfg = getPaytotaConfig();
  return Boolean(cfg.baseUrl && cfg.secretKey && cfg.brandId);
}

/** Major units → Paytota product price (minor units / cents). */
export function toPaytotaPrice(amountMajor: number, currency: string): number {
  const c = currency.toUpperCase();
  const decimals = c === "UGX" || c === "JPY" ? 0 : 2;
  const factor = 10 ** decimals;
  return Math.max(1, Math.round(amountMajor * factor));
}

export function fromPaytotaPrice(priceMinor: number, currency: string): number {
  const c = currency.toUpperCase();
  const decimals = c === "UGX" || c === "JPY" ? 0 : 2;
  const factor = 10 ** decimals;
  return Math.round((priceMinor / factor) * factor) / factor;
}

export function buildPaytotaWebhookUrl(): string {
  const projectRef = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1];
  if (!projectRef) return "";
  return `https://${projectRef}.functions.supabase.co/paytota-webhook`;
}

export async function paytotaFetch(
  path: string,
  init: RequestInit & { json?: Record<string, unknown> } = {},
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; raw: string }> {
  const cfg = getPaytotaConfig();
  const url = path.startsWith("http") ? path : `${cfg.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${cfg.secretKey}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  let body = init.body;
  if (init.json) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(url, { ...init, headers, body });
  const raw = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { raw };
  }
  return { ok: res.ok, status: res.status, json, raw };
}

export async function createPaytotaPurchase(params: {
  email: string;
  currency: string;
  amountMajor: number;
  productName: string;
  reference: string;
  country?: string;
  city?: string;
  street?: string;
  zip?: string;
  state?: string;
  phone?: string;
  successRedirect: string;
  failureRedirect: string;
  successCallback: string;
}): Promise<{
  ok: boolean;
  purchaseId: string | null;
  checkoutUrl: string | null;
  message: string;
  json: Record<string, unknown>;
}> {
  const cfg = getPaytotaConfig();
  const currency = params.currency.toUpperCase();
  const price = toPaytotaPrice(params.amountMajor, currency);

  // Paytota card checkout expects a full billing address (docs sample + smoke test).
  const defaultsByCurrency: Record<string, { country: string; city: string; street: string; zip: string; state: string }> = {
    USD: { country: "US", city: "New York", street: "1 Test Street", zip: "10001", state: "NY" },
    CAD: { country: "CA", city: "Toronto", street: "1 King Street", zip: "M5H 1A1", state: "ON" },
    GBP: { country: "GB", city: "London", street: "1 Test Road", zip: "SW1A 1AA", state: "ENG" },
    EUR: { country: "DE", city: "Berlin", street: "1 Teststrasse", zip: "10115", state: "BE" },
  };
  const defaults = defaultsByCurrency[currency] ?? defaultsByCurrency.USD;

  const client: Record<string, string> = {
    email: params.email,
    country: params.country || defaults.country,
    city: params.city || defaults.city,
    street_address: params.street || defaults.street,
    zip_code: params.zip || defaults.zip,
    state: params.state || defaults.state,
  };
  if (params.phone) client.phone = params.phone;

  const cancelRedirect = params.failureRedirect.includes("paytota=failed")
    ? params.failureRedirect.replace("paytota=failed", "paytota=cancelled")
    : params.failureRedirect;

  const { ok, status, json } = await paytotaFetch("/api/v1/purchases/", {
    method: "POST",
    json: {
      client,
      purchase: {
        currency,
        products: [{ name: params.productName, price }],
      },
      reference: params.reference,
      skip_capture: false,
      brand_id: cfg.brandId,
      success_redirect: params.successRedirect,
      failure_redirect: params.failureRedirect,
      cancel_redirect: cancelRedirect,
      success_callback: params.successCallback,
    },
  });

  const purchaseId = String(json.id ?? "").trim() || null;
  const checkoutUrl = String(json.checkout_url ?? "").trim() || null;
  const message = String(
    (json as { error_message?: string }).error_message
    ?? (json as { detail?: string }).detail
    ?? (ok ? "Checkout created" : `Paytota error ${status}`),
  );

  return {
    ok: ok && Boolean(purchaseId && checkoutUrl),
    purchaseId,
    checkoutUrl,
    message,
    json,
  };
}

export async function getPaytotaPurchase(purchaseId: string) {
  return paytotaFetch(`/api/v1/purchases/${purchaseId}/`, { method: "GET" });
}

export function isPaytotaPaidStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return s === "paid" || s === "success" || s === "successful" || s === "completed";
}

export function isPaytotaFailedStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return ["error", "failed", "cancelled", "canceled", "expired"].includes(s);
}

/** Uganda MoMo network from MSISDN (with or without 256). */
export type PaytotaUgNetwork = "airtel" | "mtnmomo";

export function normalizeUgPhone(phone: string): { e164: string; national: string; digits: string } {
  const digits = String(phone ?? "").replace(/\D/g, "");
  let national = digits;
  if (national.startsWith("256") && national.length >= 12) national = national.slice(3);
  if (national.startsWith("0") && national.length >= 10) national = national.slice(1);
  const e164 = `256${national}`;
  return { e164, national, digits };
}

export function resolvePaytotaUgNetwork(
  phone: string,
  payoutMethod?: string | null,
): PaytotaUgNetwork {
  const method = String(payoutMethod ?? "").toLowerCase();
  if (method.includes("airtel")) return "airtel";
  if (method.includes("mtn")) return "mtnmomo";

  const { national } = normalizeUgPhone(phone);
  const prefix2 = national.slice(0, 2);
  // Airtel UG: 70, 74, 75 — MTN UG: 76, 77, 78, 79
  if (["70", "74", "75"].includes(prefix2)) return "airtel";
  return "mtnmomo";
}

/** Phone format Paytota expects on execute (Airtel = national, MTN = 256…). */
export function paytotaExecutePhone(phone: string, network: PaytotaUgNetwork): string {
  const { e164, national } = normalizeUgPhone(phone);
  return network === "airtel" ? national : e164;
}

export function isPaytotaPayoutSuccessStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return ["success", "successful", "completed", "paid", "pending"].includes(s);
}

export async function createPaytotaPayout(params: {
  email: string;
  phone: string;
  currency: string;
  amountMajor: number;
  reference: string;
  description?: string;
  country?: string;
  fullName?: string;
}): Promise<{
  ok: boolean;
  payoutId: string | null;
  executionUrl: string | null;
  message: string;
  json: Record<string, unknown>;
}> {
  const cfg = getPaytotaConfig();
  const currency = params.currency.toUpperCase();
  const amount = currency === "UGX" || currency === "JPY"
    ? String(Math.max(1, Math.round(params.amountMajor)))
    : String(toPaytotaPrice(params.amountMajor, currency));

  const { e164 } = normalizeUgPhone(params.phone);
  const client: Record<string, string> = {
    email: params.email,
    phone: e164,
    country: params.country || (currency === "UGX" ? "UG" : "UG"),
  };
  if (params.fullName) client.full_name = params.fullName;

  const { ok, status, json } = await paytotaFetch("/api/v1/payouts/", {
    method: "POST",
    json: {
      client,
      payment: {
        currency,
        amount,
        description: (params.description || "eFinMoney payout").slice(0, 120),
      },
      reference: params.reference,
      brand_id: cfg.brandId,
    },
  });

  const payoutId = String(json.id ?? "").trim() || null;
  const executionUrl = String(json.execution_url ?? "").trim() || null;
  const message = String(
    (json as { error_message?: string }).error_message
    ?? (json as { detail?: string }).detail
    ?? ((json as { error?: { message?: string } }).error?.message)
    ?? (ok ? "Payout initiated" : `Paytota payout error ${status}`),
  );

  return {
    ok: ok && Boolean(payoutId && executionUrl),
    payoutId,
    executionUrl,
    message,
    json,
  };
}

export function paytotaErrorMessage(json: Record<string, unknown>, fallback: string): string {
  const all = (json as { __all__?: Array<{ message?: string }> }).__all__;
  if (Array.isArray(all) && all[0]?.message) return String(all[0].message);

  const err = (json as { error?: { message?: string } | string }).error;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && err.message) return String(err.message);

  if ((json as { error_message?: string }).error_message) {
    return String((json as { error_message?: string }).error_message);
  }
  if ((json as { detail?: string }).detail && String((json as { detail?: string }).detail) !== "error") {
    return String((json as { detail?: string }).detail);
  }
  return fallback;
}

/**
 * Execute MoMo payout. Prefer provider execution_url; otherwise POST /po/{id}/{network}/.
 * UGX body is `{ phone }` (not payout_type).
 */
export async function executePaytotaMobilePayout(params: {
  payoutId: string;
  executionUrl?: string | null;
  phone: string;
  network?: PaytotaUgNetwork;
  payoutMethod?: string | null;
}): Promise<{
  ok: boolean;
  status: string;
  message: string;
  network: PaytotaUgNetwork;
  json: Record<string, unknown>;
}> {
  const network = params.network
    ?? resolvePaytotaUgNetwork(params.phone, params.payoutMethod);
  const cfg = getPaytotaConfig();
  const effectivePhone = paytotaExecutePhone(params.phone, network);

  const rawExec = String(params.executionUrl ?? "").trim();
  const candidates: string[] = [];
  // Docs: POST {base}/po/{id}/{network}/
  candidates.push(`${cfg.baseUrl}/po/${params.payoutId}/${network}/`);
  candidates.push(`https://payments.paytota.com/po/${params.payoutId}/${network}/`);
  if (rawExec) {
    const withSlash = rawExec.endsWith("/") ? rawExec : `${rawExec}/`;
    candidates.push(withSlash);
    // If provider URL has no network, also try appending network
    if (!/\/po\/[^/]+\/(airtel|mtnmomo)\/?/.test(withSlash)) {
      candidates.push(`${withSlash.replace(/\/+$/, "")}/${network}/`);
    }
  }

  const tried = new Set<string>();
  let last: { ok: boolean; status: number; json: Record<string, unknown> } | null = null;

  for (const candidate of candidates) {
    const url = candidate.endsWith("/") ? candidate : `${candidate}/`;
    if (tried.has(url)) continue;
    tried.add(url);

    const result = await paytotaFetch(url, {
      method: "POST",
      json: { phone: effectivePhone },
    });
    last = result;

    // Success
    if (result.ok && !isPaytotaFailedStatus(result.json.status) && !(result.json as { error?: unknown }).error) {
      const detailStatus = String(result.json.status ?? result.json.detail ?? "pending");
      return {
        ok: true,
        status: detailStatus,
        message: paytotaErrorMessage(result.json, "Payout accepted"),
        network,
        json: { ...result.json, _execute_url: url },
      };
    }

    // Don't retry other hosts on business errors like terminal disabled
    const msg = paytotaErrorMessage(result.json, "").toLowerCase();
    if (msg.includes("terminal disabled") || msg.includes("insufficient")) {
      break;
    }
    // Retry on 404 / not found
    if (result.status !== 404 && result.status !== 405) {
      // keep last; try next only for routing misses
      if (result.status >= 500) continue;
      break;
    }
  }

  const status = last?.status ?? 0;
  const json = last?.json ?? {};
  const detailStatus = String(json.status ?? json.detail ?? "error");
  const message = paytotaErrorMessage(
    json,
    `Paytota execute error ${status}`,
  );

  return {
    ok: false,
    status: detailStatus,
    message,
    network,
    json: { ...json, _execute_tried: [...tried] },
  };
}

export async function getPaytotaPayout(payoutId: string) {
  return paytotaFetch(`/api/v1/payouts/${payoutId}/`, { method: "GET" });
}

export function mapPaytotaPayoutStatus(status: unknown): "pending" | "processing" | "completed" | "failed" {
  const s = String(status ?? "").toLowerCase();
  if (["success", "successful", "completed", "paid"].includes(s)) return "completed";
  if (["error", "failed", "cancelled", "canceled", "expired"].includes(s)) return "failed";
  if (["pending", "processing", "initialized"].includes(s)) return s === "initialized" ? "processing" : "processing";
  return "processing";
}
