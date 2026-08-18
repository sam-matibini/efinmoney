/**
 * Nomba hosted checkout via lenhub (mtn.lenhub.net).
 *
 * Nigeria:      POST /api/efin/payment/collection/nigeria
 * International: POST /api/efin/payment/collection/international  (USD/EUR/GBP)
 *
 * Request:  currency, amount (string), user, callback, email
 * Response: { Data: { status_code, link, order_id } }
 */

const DEFAULT_BASE = "https://mtn.lenhub.net";
const DEFAULT_NIGERIA_PATH = "/api/efin/payment/collection/nigeria";
const DEFAULT_INTERNATIONAL_PATH = "/api/efin/payment/collection/international";
const DEFAULT_MERCHANT_USER = "Efinmoney";

export type NombaCorridor = "nigeria" | "international";

export interface NombaPayConfig {
  baseUrl: string;
  nigeriaCollectionUrl: string;
  internationalCollectionUrl: string;
  merchantUser: string;
  webhookSecret: string | undefined;
}

export interface NombaCollectionPayload {
  currency: string;
  amount: string;
  user: string;
  callback: string;
  email: string;
}

export interface NombaCollectionResult {
  ok: boolean;
  httpStatus: number;
  checkoutUrl: string | null;
  orderId: string | null;
  message: string;
  json: Record<string, unknown>;
  raw: string;
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
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${host}${cleanPath}`;
}

export function getNombaPayConfig(): NombaPayConfig {
  const baseRaw = Deno.env.get("NOMBA_PAY_API_URL")?.trim()
    || Deno.env.get("GHANA_PAY_API_URL")?.trim()
    || DEFAULT_BASE;
  const baseUrl = normalizeHost(baseRaw);
  const nigeriaPath = (Deno.env.get("NOMBA_NIGERIA_COLLECTION_PATH") || DEFAULT_NIGERIA_PATH).trim();
  const intlPath = (Deno.env.get("NOMBA_INTERNATIONAL_COLLECTION_PATH") || DEFAULT_INTERNATIONAL_PATH).trim();
  const merchantUser = Deno.env.get("NOMBA_PAY_USER")?.trim()
    || Deno.env.get("GHANA_PAY_USER")?.trim()
    || DEFAULT_MERCHANT_USER;

  return {
    baseUrl,
    nigeriaCollectionUrl: joinPath(baseUrl, nigeriaPath),
    internationalCollectionUrl: joinPath(baseUrl, intlPath),
    merchantUser,
    webhookSecret: Deno.env.get("NOMBA_PAY_WEBHOOK_SECRET")?.trim() || undefined,
  };
}

export function isNombaPayConfigured(): boolean {
  // Hosted Nomba checkout ran through mtn.lenhub.net /api/efin — retired.
  return false;
}

export function buildNombaCallbackUrl(): string {
  const projectRef = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1];
  if (!projectRef) return "";
  return `https://${projectRef}.functions.supabase.co/nomba-payment-callback`;
}

export function collectionUrlForCorridor(corridor: NombaCorridor): string {
  const cfg = getNombaPayConfig();
  return corridor === "nigeria" ? cfg.nigeriaCollectionUrl : cfg.internationalCollectionUrl;
}

export function parseNombaCollectionResponse(
  httpStatus: number,
  json: Record<string, unknown>,
  raw: string,
): NombaCollectionResult {
  const data = (json.Data ?? json.data) as Record<string, unknown> | undefined;
  const checkoutUrl = String(data?.link ?? data?.checkoutLink ?? json.link ?? "").trim() || null;
  const orderId = String(data?.order_id ?? data?.orderId ?? json.order_id ?? "").trim() || null;
  const statusCode = Number(data?.status_code ?? json.status_code ?? 0);
  const message = String(
    json.message
    ?? data?.message
    ?? json.error
    ?? data?.error
    ?? json.Message
    ?? "",
  ).trim();
  const ok = httpStatus >= 200 && httpStatus < 300 && Boolean(checkoutUrl && orderId)
    && (statusCode === 0 || statusCode === 200);

  let failHint = message;
  if (!ok && !failHint) {
    if (httpStatus >= 500) failHint = "Payment partner is temporarily unavailable. Try again shortly.";
    else if (!checkoutUrl) failHint = "Checkout link was not returned. Try a larger amount or another currency.";
    else failHint = "Collection failed";
  }

  return {
    ok,
    httpStatus,
    checkoutUrl,
    orderId,
    message: failHint || (ok ? "Checkout created" : "Collection failed"),
    json,
    raw,
  };
}

export async function nombaCollectionFetch(
  _url: string,
  _payload: NombaCollectionPayload,
): Promise<NombaCollectionResult> {
  return parseNombaCollectionResponse(410, {
    message: "Nomba hosted checkout via Lenhub /api/efin is retired. Use Fincra or Flutterwave.",
  }, "retired");
}
