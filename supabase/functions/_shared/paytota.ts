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
