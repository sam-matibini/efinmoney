/**
 * Fiserv Embedded Finance (EmFi / Payfare) BaaS client.
 *
 * OpenAPI (baas_v1.0.0.yaml) paths are /v1/... and /baas/...
 * Live gateway https://emfi.fiservapis.com mounts them under /api
 * (bare /v1/... → empty 404; /api/v1/... → Apigee auth).
 *
 * Auth per OpenAPI: X-PFClient-Key + X-PFClient-Secret.
 * Gateway currently returns oauth.v2.InvalidApiKey for our key — confirm
 * with Fiserv that this consumer key is enabled on emfi.fiservapis.com.
 */

export type EmfiConfig = {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
};

const DEFAULT_HOST = "https://emfi.fiservapis.com";
const UAT_HOST = "https://api.uat.payfarelabs.com";

export function getEmfiConfig(overrideBase?: string): EmfiConfig | { error: string } {
  const apiKey = Deno.env.get("EMFI_API_KEY")?.trim() || Deno.env.get("FISERV_EMFI_API_KEY")?.trim();
  const apiSecret =
    Deno.env.get("EMFI_API_SECRET")?.trim() || Deno.env.get("FISERV_EMFI_API_SECRET")?.trim();
  const baseUrl = (
    overrideBase?.trim() ||
    Deno.env.get("EMFI_BASE_URL")?.trim() ||
    Deno.env.get("FISERV_EMFI_BASE_URL")?.trim() ||
    DEFAULT_HOST
  ).replace(/\/+$/, "");

  if (!apiKey || !apiSecret) {
    return { error: "EMFI_API_KEY / EMFI_API_SECRET not set" };
  }
  return { apiKey, apiSecret, baseUrl };
}

export function emfiUatHost(): string {
  return (Deno.env.get("EMFI_UAT_BASE_URL")?.trim() || UAT_HOST).replace(/\/+$/, "");
}

/** Normalize path: OpenAPI paths get /api prefix on emfi.fiservapis.com. */
export function emfiPath(path: string, baseUrl: string): string {
  let p = path.startsWith("/") ? path : `/${path}`;
  const host = baseUrl.replace(/\/+$/, "").toLowerCase();
  const needsApiPrefix =
    host.includes("emfi.fiservapis.com") &&
    !p.startsWith("/api/") &&
    (p.startsWith("/v1/") || p.startsWith("/baas/"));
  if (needsApiPrefix) p = `/api${p}`;
  return p;
}

export type EmfiFetchResult = {
  ok: boolean;
  status: number;
  json: Record<string, unknown> | null;
  text: string;
  url: string;
};

export async function emfiFetch(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    baseUrl?: string;
    timeoutMs?: number;
  } = {},
): Promise<EmfiFetchResult> {
  const cfg = getEmfiConfig(opts.baseUrl);
  if ("error" in cfg) {
    return { ok: false, status: 0, json: null, text: cfg.error, url: path };
  }

  const method = (opts.method || "GET").toUpperCase();
  const p = emfiPath(path, cfg.baseUrl);
  const url = `${cfg.baseUrl}${p}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-PFClient-Key": cfg.apiKey,
    "X-PFClient-Secret": cfg.apiSecret,
    // Apigee front door also looks for Api-Key
    "Api-Key": cfg.apiKey,
    "x-api-key": cfg.apiKey,
  };

  let body: string | undefined;
  if (opts.body !== undefined && method !== "GET" && method !== "HEAD") {
    body = JSON.stringify(opts.body);
    headers["Content-Type"] = "application/json";
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts.timeoutMs ?? 25_000);
  try {
    const res = await fetch(url, { method, headers, body, signal: ac.signal });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text: text.slice(0, 4000), url };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      json: null,
      text: e instanceof Error ? e.message : String(e),
      url,
    };
  } finally {
    clearTimeout(t);
  }
}

/** Auth smoke against /api/v1/users/{fake}. */
export async function emfiAuthSmoke(baseUrl?: string): Promise<EmfiFetchResult> {
  const fakeId = "00000000-0000-4000-8000-000000000001";
  return emfiFetch(`/v1/users/${fakeId}`, { method: "GET", baseUrl, timeoutMs: 20_000 });
}
