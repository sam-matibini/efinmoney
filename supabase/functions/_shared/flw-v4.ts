// Flutterwave V4 (OAuth2 client-credentials) shared helper.
// Usage:
//   import { flwFetch, FLW_BASE } from "../_shared/flw-v4.ts";
//   const json = await flwFetch("/transfers", { method: "POST", body: JSON.stringify({...}) });

export const FLW_BASE = "https://api.flutterwave.cloud/f4bexperience";
const FLW_TOKEN_URL = "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";

let cachedToken: string | null = null;
let cachedExpiry = 0; // epoch ms

export async function getFlwAccessToken(): Promise<string> {
  // Return cached token if still valid (renew 60s before expiry)
  if (cachedToken && Date.now() < cachedExpiry - 60_000) return cachedToken;

  const clientId = (Deno.env.get("FLW_CLIENT_ID") || "").trim();
  const clientSecret = (Deno.env.get("FLW_CLIENT_SECRET") || "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("FLW_CLIENT_ID / FLW_CLIENT_SECRET are not configured");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(FLW_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    console.error("FLW V4 auth failed", res.status, json);
    throw new Error(json?.error_description || json?.error || `FLW auth failed (${res.status})`);
  }
  cachedToken = json.access_token as string;
  // expires_in is seconds; default 600
  const ttlMs = (Number(json.expires_in) || 600) * 1000;
  cachedExpiry = Date.now() + ttlMs;
  return cachedToken;
}

export interface FlwFetchOptions extends RequestInit {
  /** Idempotency key for POSTs. Auto-generated if not provided. */
  idempotencyKey?: string;
  /** Trace ID for correlating logs. Auto-generated if not provided. */
  traceId?: string;
}

export async function flwFetch(path: string, opts: FlwFetchOptions = {}): Promise<{ ok: boolean; status: number; json: any }> {
  const token = await getFlwAccessToken();
  const headers = new Headers(opts.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Trace-Id", opts.traceId || crypto.randomUUID());
  if (opts.method && opts.method !== "GET") {
    headers.set("X-Idempotency-Key", opts.idempotencyKey || crypto.randomUUID());
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }
  const url = path.startsWith("http") ? path : `${FLW_BASE}${path}`;
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) console.warn(`FLW V4 ${opts.method || "GET"} ${path} -> ${res.status}`, json);
  return { ok: res.ok, status: res.status, json };
}

/** V4 success envelope: { status: "success", data: {...} } */
export function isFlwSuccess(json: any): boolean {
  return json?.status === "success" || json?.status === "successful";
}
