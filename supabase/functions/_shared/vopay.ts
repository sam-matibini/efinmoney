/**
 * VoPay B2B API helpers (Interac Request Money + settlement to Loop Autodeposit).
 * Auth: Signature = sha1(Key + SharedSecret + YYYY-MM-DD)
 * @see https://docs.vopay.com/reference/getting-started-with-your-api
 */

const DEFAULT_PROD = "https://earthnode.vopay.com/api/v2";
const DEFAULT_SANDBOX = "https://earthnode-dev.vopay.com/api/v2";

export type VoPayConfig = {
  accountId: string;
  apiKey: string;
  sharedSecret: string;
  baseUrl: string;
};

export function getVoPayConfig(): VoPayConfig | null {
  const accountId = (Deno.env.get("VOPAY_ACCOUNT_ID") || "").trim();
  const apiKey = (Deno.env.get("VOPAY_API_KEY") || "").trim();
  const sharedSecret = (Deno.env.get("VOPAY_API_SHARED_SECRET") || "").trim();
  if (!accountId || !apiKey || !sharedSecret) return null;

  const env = (Deno.env.get("VOPAY_ENV") || "production").trim().toLowerCase();
  const baseUrl =
    (Deno.env.get("VOPAY_BASE_URL") || "").trim() ||
    (env === "sandbox" || env === "dev" || env === "development" ? DEFAULT_SANDBOX : DEFAULT_PROD);

  return { accountId, apiKey, sharedSecret, baseUrl };
}

export function voPayConfigured(): boolean {
  return getVoPayConfig() !== null;
}

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function voPaySignature(apiKey: string, sharedSecret: string, date = new Date()): Promise<string> {
  const ymd = date.toISOString().slice(0, 10);
  return sha1Hex(`${apiKey}${sharedSecret}${ymd}`);
}

export async function voPayValidationKey(sharedSecret: string, recordId: string): Promise<string> {
  return sha1Hex(`${sharedSecret}${recordId}`);
}

export async function voPayPost(
  path: string,
  fields: Record<string, string | number | boolean | undefined | null>,
): Promise<Record<string, unknown>> {
  const cfg = getVoPayConfig();
  if (!cfg) throw new Error("VoPay is not configured (VOPAY_ACCOUNT_ID / VOPAY_API_KEY / VOPAY_API_SHARED_SECRET)");

  const signature = await voPaySignature(cfg.apiKey, cfg.sharedSecret);
  const body = new URLSearchParams();
  body.set("AccountID", cfg.accountId);
  body.set("Key", cfg.apiKey);
  body.set("Signature", signature);
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === "") continue;
    body.set(k, typeof v === "boolean" ? (v ? "true" : "false") : String(v));
  }

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.ErrorMessage || data.error || `VoPay HTTP ${res.status}`));
  }
  return data;
}

export async function voPayGet(
  path: string,
  query: Record<string, string | number | undefined | null> = {},
): Promise<Record<string, unknown>> {
  const cfg = getVoPayConfig();
  if (!cfg) throw new Error("VoPay is not configured");

  const signature = await voPaySignature(cfg.apiKey, cfg.sharedSecret);
  const qs = new URLSearchParams();
  qs.set("AccountID", cfg.accountId);
  qs.set("Key", cfg.apiKey);
  qs.set("Signature", signature);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }

  const res = await fetch(
    `${cfg.baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}?${qs.toString()}`,
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.ErrorMessage || data.error || `VoPay HTTP ${res.status}`));
  }
  return data;
}

/** Extract hosted / embed URL from money-request create or transaction lookup. */
export function extractVoPayHostedUrl(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.HostedURL,
    payload.HostedUrl,
    payload.EmbedURL,
    payload.EmbedUrl,
    payload.URL,
    payload.Url,
    payload.PaymentURL,
    payload.PaymentUrl,
    payload.MoneyRequestURL,
    payload.MoneyRequestUrl,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//i.test(c)) return c;
  }
  return null;
}

export function voPaySuccess(payload: Record<string, unknown>): boolean {
  const s = payload.Success;
  return s === true || s === "true" || s === 1 || s === "1";
}
