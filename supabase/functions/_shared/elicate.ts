/**
 * Elicate Pay API v1 client.
 * Canonical host: https://elicatepay.vercel.app
 * Override live host via ELICATE_LIVE_BASE_URL if needed.
 *
 * Set ELICATE_ENV=live for production credentials (ep_live_*).
 */

const API_PREFIX = "/api/v1";
const DEFAULT_HOST = "https://elicatepay.vercel.app";

export interface ElicateConfig {
  mode: "live" | "sandbox";
  host: string;
  chargeUrl: string;
  payoutUrl: string;
  /** @deprecated equals chargeUrl */
  url: string;
  secretKey: string | undefined;
  publicKey: string | undefined;
  webhookSecret: string | undefined;
}

export interface ElicateApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
  error?: string;
  rawText: string;
}

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

function joinPath(host: string, path: string): string {
  if (!host) return "";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${host}${cleanPath}`;
}

export function getElicateConfig(): ElicateConfig {
  const envRaw = (Deno.env.get("ELICATE_ENV") ?? "").trim().toLowerCase();
  const liveUrlRaw = Deno.env.get("ELICATE_LIVE_BASE_URL");
  const liveKey = Deno.env.get("ELICATE_LIVE_SECRET_KEY");
  const liveCredsPresent = Boolean(liveKey);

  const forceSandbox = envRaw === "sandbox" || envRaw === "test";
  const explicitLive = ["live", "production", "prod", "1", "true"].includes(envRaw);
  const isLive = !forceSandbox && (explicitLive || liveCredsPresent);

  const host = isLive
    ? normalizeHost(liveUrlRaw?.trim() || DEFAULT_HOST)
    : DEFAULT_HOST;

  const chargeUrl = joinPath(host, `${API_PREFIX}/payments/charge`);
  const payoutUrl = joinPath(host, `${API_PREFIX}/payouts`);

  return {
    mode: isLive ? "live" : "sandbox",
    host,
    chargeUrl,
    payoutUrl,
    url: chargeUrl,
    secretKey: isLive ? liveKey : Deno.env.get("ELICATE_SECRET_KEY"),
    publicKey: isLive
      ? Deno.env.get("ELICATE_LIVE_PUBLIC_KEY")
      : Deno.env.get("ELICATE_PUBLIC_KEY"),
    webhookSecret: isLive
      ? Deno.env.get("ELICATE_LIVE_WEBHOOK_SECRET")
      : Deno.env.get("ELICATE_WEBHOOK_SECRET"),
  };
}

/** Back-compat export used by diagnostics. */
export const SANDBOX_ELICATE_URL = `${DEFAULT_HOST}${API_PREFIX}/payments/charge`;

async function parseJson(res: Response): Promise<{ json: Record<string, unknown>; rawText: string }> {
  const rawText = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    json = { raw: rawText.slice(0, 500) };
  }
  return { json, rawText };
}

function apiError(json: Record<string, unknown>, fallback: string): string {
  return String(json.error ?? json.message ?? fallback);
}

async function secretFetch(
  path: string,
  init: RequestInit = {},
): Promise<ElicateApiResult> {
  const cfg = getElicateConfig();
  if (!cfg.secretKey) {
    return {
      ok: false,
      status: 500,
      data: {},
      error: `ELICATE_${cfg.mode === "live" ? "LIVE_" : ""}SECRET_KEY not configured`,
      rawText: "",
    };
  }
  const url = joinPath(cfg.host, path.startsWith("/") ? path : `/${path}`);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${cfg.secretKey}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  const { json, rawText } = await parseJson(res);
  const ok = res.ok && !json.error;
  return {
    ok,
    status: res.status,
    data: json,
    error: ok ? undefined : apiError(json, `Elicate request failed (${res.status})`),
    rawText,
  };
}

export async function elicateCharge(params: {
  amount: number;
  phone: string;
  network: string;
  currency?: string;
  reference?: string;
  customer_name?: string;
  redirect_url?: string;
  return_url?: string;
}): Promise<ElicateApiResult> {
  const body: Record<string, unknown> = {
    amount: params.amount,
    phone: params.phone,
    network: params.network,
    currency: params.currency ?? "ZMW",
  };
  if (params.reference) body.reference = params.reference;
  if (params.customer_name) body.customer_name = params.customer_name;
  if (params.redirect_url) body.redirect_url = params.redirect_url;
  if (params.return_url) body.return_url = params.return_url;
  return secretFetch(`${API_PREFIX}/payments/charge`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function elicateCheckoutPay(params: Record<string, unknown>): Promise<ElicateApiResult> {
  const cfg = getElicateConfig();
  const url = joinPath(cfg.host, `${API_PREFIX}/checkout/pay`);
  const body = { ...params };
  if (!body.public_key && !body.link_slug && cfg.publicKey) {
    body.public_key = cfg.publicKey;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const { json, rawText } = await parseJson(res);
  const ok = res.ok && !json.error;
  return {
    ok,
    status: res.status,
    data: json,
    error: ok ? undefined : apiError(json, `Checkout failed (${res.status})`),
    rawText,
  };
}

export async function elicateCheckoutStatus(transactionId: string): Promise<ElicateApiResult> {
  const cfg = getElicateConfig();
  const url = joinPath(cfg.host, `${API_PREFIX}/checkout/status/${encodeURIComponent(transactionId)}`);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const { json, rawText } = await parseJson(res);
  const ok = res.ok && !json.error;
  return {
    ok,
    status: res.status,
    data: json,
    error: ok ? undefined : apiError(json, `Status failed (${res.status})`),
    rawText,
  };
}

export async function elicatePaymentDetails(transactionId: string): Promise<ElicateApiResult> {
  return secretFetch(`${API_PREFIX}/payments/${encodeURIComponent(transactionId)}`, {
    method: "GET",
  });
}

/** Returns the raw Response for SSE streaming (caller reads body). */
export async function elicatePaymentStreamResponse(transactionId: string): Promise<Response> {
  const cfg = getElicateConfig();
  if (!cfg.secretKey) throw new Error("Elicate secret key not configured");
  const url = joinPath(cfg.host, `${API_PREFIX}/payments/${encodeURIComponent(transactionId)}/stream`);
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${cfg.secretKey}`,
      Accept: "text/event-stream",
    },
  });
}

export async function elicateListPaymentLinks(): Promise<ElicateApiResult> {
  return secretFetch(`${API_PREFIX}/payment-links`, { method: "GET" });
}

export async function elicateCreatePaymentLink(params: Record<string, unknown>): Promise<ElicateApiResult> {
  return secretFetch(`${API_PREFIX}/payment-links`, {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function elicateGetPaymentLink(linkId: string): Promise<ElicateApiResult> {
  return secretFetch(`${API_PREFIX}/payment-links/${encodeURIComponent(linkId)}`, {
    method: "GET",
  });
}

export async function elicateUpdatePaymentLink(
  linkId: string,
  params: Record<string, unknown>,
): Promise<ElicateApiResult> {
  return secretFetch(`${API_PREFIX}/payment-links/${encodeURIComponent(linkId)}`, {
    method: "PATCH",
    body: JSON.stringify(params),
  });
}

export async function elicateCreatePayout(params: {
  amount: number;
  currency?: string;
  account_bank: string;
  account_number: string;
  beneficiary_name: string;
  reference?: string;
  narration?: string;
}): Promise<ElicateApiResult> {
  return secretFetch(`${API_PREFIX}/payouts`, {
    method: "POST",
    body: JSON.stringify({
      amount: params.amount,
      currency: params.currency ?? "ZMW",
      account_bank: params.account_bank,
      account_number: params.account_number,
      beneficiary_name: params.beneficiary_name,
      reference: params.reference,
      narration: params.narration,
    }),
  });
}

export async function elicatePayoutStatus(payoutId: string): Promise<ElicateApiResult> {
  return secretFetch(`${API_PREFIX}/payouts/${encodeURIComponent(payoutId)}`, {
    method: "GET",
  });
}

export async function elicateTestWebhook(params: {
  url: string;
  secret: string;
}): Promise<ElicateApiResult> {
  const cfg = getElicateConfig();
  const url = joinPath(cfg.host, `${API_PREFIX}/webhooks/test`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(params),
  });
  const { json, rawText } = await parseJson(res);
  const ok = res.ok && !json.error;
  return {
    ok,
    status: res.status,
    data: json,
    error: ok ? undefined : apiError(json, `Webhook test failed (${res.status})`),
    rawText,
  };
}

export function extractRedirectUrl(payload: Record<string, unknown>): string | null {
  const meta = payload.meta as Record<string, unknown> | undefined;
  const auth = (meta?.authorization ?? payload.authorization) as Record<string, unknown> | undefined;
  const url =
    auth?.redirect_url
    ?? meta?.redirect_url
    ?? payload.redirect_url
    ?? null;
  return typeof url === "string" && url.length > 0 ? url : null;
}

export function extractTransactionId(payload: Record<string, unknown>): string | null {
  const id =
    payload.transaction_id
    ?? payload.payout_id
    ?? (payload.data as Record<string, unknown> | undefined)?.transaction_id
    ?? (payload.data as Record<string, unknown> | undefined)?.payout_id
    ?? payload.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Normalize provider status strings (incl. test success). */
export function isElicateSuccessStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase().trim();
  return ["success", "successful", "completed", "paid", "test success"].includes(s);
}

export function isElicateFailureStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase().trim();
  return ["failed", "failure", "rejected", "cancelled", "canceled"].includes(s);
}
