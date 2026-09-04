/**
 * ePay Merchant API (v2) — payin / payout helpers.
 *
 * Portal mode: Public–Private Key Pair (asymmetric).
 * Official docs also document API_KEY + SHA256 signing; we support both via
 * EPAY_SIGN_MODE=rsa|api_key (default rsa when private key is present).
 *
 * Secrets (Supabase Edge):
 *   EPAY_ACCOUNT                 merchant login email
 *   EPAY_MERCHANT_NAME           display / legal merchant name
 *   EPAY_PAYIN_API_KEY           pay-in API key (api_key mode / some envs)
 *   EPAY_PAYOUT_API_KEY          payout API key
 *   EPAY_PAYIN_PRIVATE_KEY       PEM (merchant private key for Receiving Payment)
 *   EPAY_PAYOUT_PRIVATE_KEY      PEM (merchant private key for Payment)
 *   EPAY_PLATFORM_PAYIN_PUBLIC_KEY   PEM (ePay public key — verify payin callbacks)
 *   EPAY_PLATFORM_PAYOUT_PUBLIC_KEY  PEM (ePay public key — verify payout callbacks)
 *   EPAY_BASE_URL                default https://api.epay.com/capi/openapi
 *   EPAY_SIGN_MODE               rsa | api_key
 *   EPAY_PROXY_URL               optional reverse proxy (static egress IP)
  */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export type EpaySuite = "payin" | "payout";

/**
 * Optional single JSON secret (avoids hitting the 100-secret project cap):
 * {
 *   "account", "merchantName", "signMode", "baseUrl", "proxyUrl",
 *   "payinPrivateKey", "payoutPrivateKey",
 *   "platformPayinPublicKey", "platformPayoutPublicKey",
 *   "payinApiKey", "payoutApiKey"
 * }
 */
function epayBundle(): Record<string, string> {
  const raw = (Deno.env.get("EPAY_BUNDLE") || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v == null) continue;
      out[k] = String(v).replace(/\\n/g, "\n");
    }
    return out;
  } catch (e) {
    console.error("EPAY_BUNDLE JSON parse failed", e);
    return {};
  }
}

function epayCfg(key: string, envNames: string[]): string {
  const b = epayBundle();
  if (b[key]) return b[key].trim();
  for (const name of envNames) {
    const v = (Deno.env.get(name) || "").trim();
    if (v) return v.replace(/\\n/g, "\n");
  }
  return "";
}

export function getEpayBaseUrl(): string {
  const proxy = epayCfg("proxyUrl", ["EPAY_PROXY_URL"]);
  if (proxy) return proxy.replace(/\/$/, "");
  return (epayCfg("baseUrl", ["EPAY_BASE_URL"]) || "https://api.epay.com/capi/openapi").replace(/\/$/, "");
}

export function getEpayAccount(): string {
  return epayCfg("account", ["EPAY_ACCOUNT"]);
}

export function getEpayMerchantName(): string {
  return epayCfg("merchantName", ["EPAY_MERCHANT_NAME"]) || "eFinMoney";
}

/** Prefer explicit signMode; else api_key when key present; else rsa. */
export function getEpaySignMode(): "rsa" | "api_key" {
  const explicit = epayCfg("signMode", ["EPAY_SIGN_MODE"]).toLowerCase();
  if (explicit === "rsa" || explicit === "api_key") return explicit;
  if (epayCfg("payinApiKey", ["EPAY_PAYIN_API_KEY"]) || epayCfg("payoutApiKey", ["EPAY_PAYOUT_API_KEY"])) {
    return "api_key";
  }
  return "rsa";
}

export function isEpayPayinConfigured(): boolean {
  if (!getEpayAccount()) return false;
  if (getEpaySignMode() === "api_key") {
    return !!epayCfg("payinApiKey", ["EPAY_PAYIN_API_KEY"]);
  }
  return !!epayCfg("payinPrivateKey", ["EPAY_PAYIN_PRIVATE_KEY"]);
}

export function isEpayPayoutConfigured(): boolean {
  if (!getEpayAccount()) return false;
  if (getEpaySignMode() === "api_key") {
    return !!epayCfg("payoutApiKey", ["EPAY_PAYOUT_API_KEY"]);
  }
  return !!epayCfg("payoutPrivateKey", ["EPAY_PAYOUT_PRIVATE_KEY"]);
}

function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, "\n").trim();
}

function pemToArrayBuffer(pem: string, kind: "private" | "public"): ArrayBuffer {
  const cleaned = normalizePem(pem)
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Remove empty / null values recursively (ePay sign step 1). */
export function stripEmpty(value: unknown): unknown {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) {
    const arr = value.map(stripEmpty).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = stripEmpty(v);
      if (next !== undefined) out[k] = next;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}

/** ePay queryString form: key=value&nested={a=1&b=2} */
export function toQueryString(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v === undefined || v === null || v === "") continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      parts.push(`${key}={${toQueryString(v as Record<string, unknown>)}}`);
    } else {
      parts.push(`${key}=${String(v)}`);
    }
  }
  return parts.join("&");
}

async function sha256HexUpper(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Documented API_KEY signature (SHA256 of queryString + &key=API_KEY). */
export async function signWithApiKey(
  param: Record<string, unknown>,
  apiKey: string,
): Promise<string> {
  const cleaned = stripEmpty(param) as Record<string, unknown>;
  const sorted = sortKeys(cleaned) as Record<string, unknown>;
  const q = toQueryString(sorted);
  return sha256HexUpper(`${q}&key=${apiKey}`);
}

async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem, "private"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function importRsaPublicKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(pem, "public"),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/**
 * Asymmetric sign: SHA256-with-RSA over the sorted queryString (no API key suffix).
 * Base64-encoded signature — common for ePay Public–Private Key Pair mode.
 */
export async function signWithRsa(
  param: Record<string, unknown>,
  privateKeyPem: string,
): Promise<string> {
  const cleaned = stripEmpty(param) as Record<string, unknown>;
  const sorted = sortKeys(cleaned) as Record<string, unknown>;
  const q = toQueryString(sorted);
  const key = await importRsaPrivateKey(privateKeyPem);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(q),
  );
  return bytesToBase64(new Uint8Array(sig));
}

export async function verifyWithRsa(
  param: Record<string, unknown>,
  sign: string,
  publicKeyPem: string,
): Promise<boolean> {
  try {
    const cleaned = stripEmpty(param) as Record<string, unknown>;
    const sorted = sortKeys(cleaned) as Record<string, unknown>;
    const q = toQueryString(sorted);
    const key = await importRsaPublicKey(publicKeyPem);
    const sigBytes = base64ToBytes(sign.trim());
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      sigBytes,
      new TextEncoder().encode(q),
    );
  } catch (e) {
    console.error("epay verifyWithRsa failed", e);
    return false;
  }
}

export async function signEpayParam(
  suite: EpaySuite,
  param: Record<string, unknown>,
): Promise<string> {
  if (getEpaySignMode() === "api_key") {
    const apiKey = suite === "payin"
      ? epayCfg("payinApiKey", ["EPAY_PAYIN_API_KEY"])
      : epayCfg("payoutApiKey", ["EPAY_PAYOUT_API_KEY"]);
    if (!apiKey) throw new Error(`Missing EPAY_${suite.toUpperCase()}_API_KEY`);
    return signWithApiKey(param, apiKey);
  }
  const pem = suite === "payin"
    ? epayCfg("payinPrivateKey", ["EPAY_PAYIN_PRIVATE_KEY"])
    : epayCfg("payoutPrivateKey", ["EPAY_PAYOUT_PRIVATE_KEY"]);
  if (!pem) throw new Error(`Missing EPAY_${suite.toUpperCase()}_PRIVATE_KEY`);
  return signWithRsa(param, pem);
}

export async function verifyEpayCallback(
  suite: EpaySuite,
  param: Record<string, unknown>,
  sign: string,
): Promise<boolean> {
  if (getEpaySignMode() === "api_key") {
    const apiKey = suite === "payin"
      ? epayCfg("payinApiKey", ["EPAY_PAYIN_API_KEY"])
      : epayCfg("payoutApiKey", ["EPAY_PAYOUT_API_KEY"]);
    if (!apiKey) return false;
    const expected = await signWithApiKey(param, apiKey);
    return expected === String(sign || "").toUpperCase();
  }
  const pem = suite === "payin"
    ? epayCfg("platformPayinPublicKey", ["EPAY_PLATFORM_PAYIN_PUBLIC_KEY"])
    : epayCfg("platformPayoutPublicKey", ["EPAY_PLATFORM_PAYOUT_PUBLIC_KEY"]);
  if (!pem) {
    console.error("epay platform public key missing for verify");
    return false;
  }
  return verifyWithRsa(param, sign, pem);
}

export async function epayPost(
  path: string,
  suite: EpaySuite,
  param: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; json: any; raw: string }> {
  const bodyParam = {
    ...param,
    epayAccount: param.epayAccount || getEpayAccount(),
    merchantName: param.merchantName || getEpayMerchantName(),
    version: param.version || "V2.0.0",
  };
  const sign = await signEpayParam(suite, bodyParam as Record<string, unknown>);
  const url = `${getEpayBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ param: bodyParam, sign }),
  });
  const raw = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = { raw };
  }
  return { ok: res.ok, status: res.status, json, raw };
}

/** Cashier / gateway pay-in — returns hosted checkout URL when successful. */
export async function createEpayGatewayOrder(input: {
  merchantOrderNo: string;
  amount: string;
  currency: string;
  notifyUrl: string;
  successUrl: string;
  failUrl: string;
  remark?: string;
  language?: string;
  /** ISO country to surface local rails (optional). */
  paymentCountry?: string;
}): Promise<{ ok: boolean; status: number; json: any; paymentUrl: string | null; raw: string }> {
  const ccy = input.currency.toUpperCase();
  const result = await epayPost("/gateway/sendTransaction", "payin", {
    amount: input.amount,
    currency: ccy,
    // Show all configured channels so guests can pay without logging into ePay
    // (account must have anonymous / card rails enabled by ePay ops).
    checkOutType: "0",
    paymentCurrency: ccy,
    ...(input.paymentCountry ? { paymentCountry: input.paymentCountry.toUpperCase() } : {}),
    merchantOrderNo: input.merchantOrderNo,
    notifyUrl: input.notifyUrl,
    successUrl: input.successUrl,
    failUrl: input.failUrl,
    remark: input.remark || "eFinMoney top-up",
    language: input.language || "en",
    extendFields: { source: "efinmoney" },
  });
  const data = result.json?.data ?? result.json?.param ?? result.json ?? {};
  const paymentUrl = String(
    data.epayUrl
      || data.payUrl
      || data.paymentUrl
      || data.checkoutUrl
      || data.url
      || "",
  ).trim() || null;
  return { ...result, paymentUrl };
}

export function buildEpayWebhookUrl(fn = "epay-webhook"): string {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  return `${base}/functions/v1/${fn}`;
}
