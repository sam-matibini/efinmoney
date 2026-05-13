// Flutterwave V4 (OAuth2 client-credentials) shared helper.
// Usage:
//   import { flwFetch, FLW_BASE } from "../_shared/flw-v4.ts";
//   const json = await flwFetch("/transfers", { method: "POST", body: JSON.stringify({...}) });

export const FLW_BASE = "https://api.flutterwave.cloud/f4bexperience";
const FLW_TOKEN_URL = "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";

let cachedToken: string | null = null;
let cachedExpiry = 0; // epoch ms

function maskCred(name: string, val: string) {
  if (!val) return `${name}=<MISSING>`;
  return `${name}(len=${val.length}, prefix=${val.slice(0, 4)}…${val.slice(-4)})`;
}

export async function getFlwAccessToken(): Promise<string> {
  // Return cached token if still valid (renew 60s before expiry)
  if (cachedToken && Date.now() < cachedExpiry - 60_000) return cachedToken;

  const clientId = (Deno.env.get("FLW_CLIENT_ID") || "").trim();
  const clientSecret = (Deno.env.get("FLW_CLIENT_SECRET") || "").trim();
  console.log("[FLW AUTH] Token URL:", FLW_TOKEN_URL);
  console.log("[FLW AUTH] Creds:", maskCred("FLW_CLIENT_ID", clientId), maskCred("FLW_CLIENT_SECRET", clientSecret));
  if (!clientId || !clientSecret) {
    throw new Error("FLW_CLIENT_ID / FLW_CLIENT_SECRET are not configured");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const t0 = Date.now();
  const res = await fetch(FLW_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  console.log(`[FLW AUTH] Response status=${res.status} in ${Date.now() - t0}ms body=`, JSON.stringify(json).slice(0, 500));
  if (!res.ok || !json?.access_token) {
    console.error("[FLW AUTH] FAILED", res.status, json);
    throw new Error(json?.error_description || json?.error || `FLW auth failed (${res.status})`);
  }
  cachedToken = json.access_token as string;
  const ttlMs = (Number(json.expires_in) || 600) * 1000;
  cachedExpiry = Date.now() + ttlMs;
  console.log(`[FLW AUTH] OK — token len=${cachedToken.length}, ttl=${ttlMs / 1000}s`);
  return cachedToken;
}

export interface FlwFetchOptions extends RequestInit {
  /** Idempotency key for POSTs. Auto-generated if not provided. */
  idempotencyKey?: string;
  /** Trace ID for correlating logs. Auto-generated if not provided. */
  traceId?: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [400, 1200];

export async function flwFetch(path: string, opts: FlwFetchOptions = {}): Promise<{ ok: boolean; status: number; json: any }> {
  const token = await getFlwAccessToken();
  const headers = new Headers(opts.headers || {});
  const timeoutMs = Math.max(1_000, Number(opts.timeoutMs) || 8_000);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Trace-Id", opts.traceId || crypto.randomUUID());
  // Stable idempotency key reused across retries so FLW dedupes if a prior attempt secretly succeeded.
  const idemKey = opts.idempotencyKey || crypto.randomUUID();
  if (opts.method && opts.method !== "GET") {
    headers.set("X-Idempotency-Key", idemKey);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }
  const url = path.startsWith("http") ? path : `${FLW_BASE}${path}`;

  let lastStatus = 0;
  let lastJson: any = {};
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort("FLW request timeout"), timeoutMs);
      const t0 = Date.now();
      console.log(`[FLW REQ] ${opts.method || "GET"} ${url} body=`, typeof opts.body === "string" ? opts.body.slice(0, 1000) : "<none>");
      const res = await fetch(url, { ...opts, headers, signal: controller.signal });
      clearTimeout(timeout);
      const text = await res.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
      lastStatus = res.status;
      lastJson = json;
      console.log(`[FLW RES] ${opts.method || "GET"} ${path} -> ${res.status} in ${Date.now() - t0}ms body=`, JSON.stringify(json).slice(0, 1500));

      if (res.ok) return { ok: true, status: res.status, json };

      const transient = TRANSIENT_STATUSES.has(res.status) ||
        (typeof json?.raw === "string" && /OriginTimeout|Service unavailable|Gateway Timeout/i.test(json.raw));

      if (!transient || attempt === RETRY_DELAYS_MS.length) {
        console.warn(`[FLW NON-OK] ${opts.method || "GET"} ${path} -> ${res.status}`, JSON.stringify(json).slice(0, 1500));
        return { ok: false, status: res.status, json };
      }
      console.warn(`[FLW TRANSIENT] ${opts.method || "GET"} ${path} -> ${res.status} (retry ${attempt + 1}/${RETRY_DELAYS_MS.length})`);
    } catch (err) {
      if (timeout) clearTimeout(timeout);
      lastErr = err;
      const timedOut = err instanceof DOMException && err.name === "AbortError";
      console.warn(`[FLW NETERR] ${opts.method || "GET"} ${path} attempt ${attempt + 1}: ${err instanceof Error ? err.message : String(err)} (timedOut=${timedOut})`);
      if (attempt === RETRY_DELAYS_MS.length) {
        console.error(`[FLW NETERR FINAL] ${opts.method || "GET"} ${path} after retries`, err);
        return {
          ok: false,
          status: timedOut ? 504 : 0,
          json: { error: timedOut ? "Gateway Timeout" : err instanceof Error ? err.message : "network error" },
        };
      }
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
  // Unreachable, but keep TS happy
  return { ok: false, status: lastStatus, json: lastJson || { error: String(lastErr) } };
}

/** V4 success envelope: { status: "success", data: {...} } */
export function isFlwSuccess(json: any): boolean {
  return json?.status === "success" || json?.status === "successful";
}
