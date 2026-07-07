/**
 * Ghana direct mobile-money API (mtn.lenhub.net — EFINMONEY).
 *
 * Collection: POST /api/efin/payment/collection/ghana
 * Payout:      POST /api/efin/payment/payout/ghana
 *
 * Confirmed live payload (no transaction_type — implied by endpoint):
 *   user, call_back_url, customer_number, nickname, transaction_id, amount, reference, network
 *
 * Networks: MTN | AIR (AirtelTigo) | VOD (Telecel)
 * Response codes: 202 = accepted, 219 = duplicate transaction_id
 */

const DEFAULT_BASE = "https://mtn.lenhub.net";
const DEFAULT_COLLECTION_PATH = "/api/efin/payment/collection/ghana";
const DEFAULT_PAYOUT_PATH = "/api/efin/payment/payout/ghana";
const DEFAULT_MERCHANT_USER = "Efinmoney";

export type GhanaPayNetwork = "MTN" | "AIR" | "VOD";

export interface GhanaPayConfig {
  mode: "live" | "sandbox";
  baseUrl: string;
  collectionUrl: string;
  payoutUrl: string;
  merchantUser: string;
  webhookSecret: string | undefined;
}

/** Exact shape sent to lenhub (verified in Postman). */
export interface GhanaPayPayload {
  user: string;
  call_back_url: string;
  customer_number: string;
  nickname: string;
  transaction_id: string;
  amount: number;
  reference: string;
  network: GhanaPayNetwork;
}

export interface GhanaPayApiResult {
  ok: boolean;
  httpStatus: number;
  response_code: string;
  response_message: string;
  duplicate: boolean;
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

export function getGhanaPayConfig(): GhanaPayConfig {
  const envRaw = (Deno.env.get("GHANA_PAY_ENV") ?? "live").trim().toLowerCase();
  const isLive = !["sandbox", "test"].includes(envRaw);

  const baseRaw = Deno.env.get("GHANA_PAY_API_URL")?.trim() || DEFAULT_BASE;
  const baseUrl = normalizeHost(baseRaw);

  const collectionPath = (Deno.env.get("GHANA_PAY_COLLECTION_PATH") || DEFAULT_COLLECTION_PATH).trim();
  const payoutPath = (Deno.env.get("GHANA_PAY_PAYOUT_PATH") || DEFAULT_PAYOUT_PATH).trim();
  const merchantUser = Deno.env.get("GHANA_PAY_USER")?.trim() || DEFAULT_MERCHANT_USER;

  return {
    mode: isLive ? "live" : "sandbox",
    baseUrl,
    collectionUrl: joinPath(baseUrl, collectionPath),
    payoutUrl: joinPath(baseUrl, payoutPath),
    merchantUser,
    webhookSecret: Deno.env.get("GHANA_PAY_WEBHOOK_SECRET")?.trim() || undefined,
  };
}

export function isGhanaPayConfigured(): boolean {
  const cfg = getGhanaPayConfig();
  return Boolean(cfg.baseUrl && cfg.merchantUser && cfg.collectionUrl && cfg.payoutUrl);
}

/** Unique provider transaction_id — reuse triggers response_code 219. */
export function newGhanaTransactionId(prefix = "efin"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function newGhanaReference(kind: "topup" | "payout", id: string): string {
  const tag = kind === "topup" ? "collection" : "payout";
  return `efin-${tag}-${id.slice(0, 8)}-${Date.now()}`;
}

export function resolveGhanaNetwork(input?: string | null): GhanaPayNetwork {
  const key = String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (key === "MTN" || key.includes("MTN")) return "MTN";
  if (key === "VOD" || key.includes("VODAFONE") || key.includes("TELECEL")) return "VOD";
  if (key === "AIR" || key.includes("AIRTEL") || key.includes("TIGO")) return "AIR";
  return "MTN";
}

/** International format as used in live tests: 233XXXXXXXXX */
export function formatGhanaPhoneIntl(raw?: string | null): string {
  let phone = String(raw ?? "").replace(/[^\d]/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("0")) phone = `233${phone.slice(1)}`;
  if (!phone.startsWith("233")) phone = `233${phone}`;
  return phone;
}

export function buildCallbackUrl(): string {
  const projectRef = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1];
  if (!projectRef) return "";
  return `https://${projectRef}.functions.supabase.co/ghana-payment-callback`;
}

export function parseGhanaPayResponse(
  httpStatus: number,
  json: Record<string, unknown>,
  raw: string,
): GhanaPayApiResult {
  const response_code = String(json.response_code ?? json.code ?? "");
  const response_message = String(
    json.response_message ?? json.message ?? json.error ?? "",
  );
  const duplicate = response_code === "219"
    || response_message.toLowerCase().includes("duplicate");
  const accepted = httpStatus >= 200 && httpStatus < 300
    && (response_code === "202" || response_message.toLowerCase().includes("successfully received"));
  return {
    ok: accepted && !duplicate,
    httpStatus,
    response_code,
    response_message,
    duplicate,
    json,
    raw,
  };
}

export async function ghanaPayFetch(
  url: string,
  payload: GhanaPayPayload,
  opts: { timeoutMs?: number } = {},
): Promise<GhanaPayApiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const raw = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      json = { raw };
    }
    return parseGhanaPayResponse(res.status, json, raw);
  } finally {
    clearTimeout(timer);
  }
}
