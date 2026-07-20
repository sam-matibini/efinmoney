/**
 * Swychr Connect JWT auth — separate login per API suite.
 * Base host: https://api.accountpe.com
 *
 * Tokens from /admin/auth are valid ~90 days (per Swychr). Cache locally,
 * refresh 1 day early, and force re-login on HTTP 401.
 */

export type SwychrSuite = "payin" | "payout" | "card" | "airtime";

const API_HOST = "https://api.accountpe.com";

/** 90 days minus 1 day buffer */
const TOKEN_TTL_MS = 89 * 24 * 60 * 60 * 1000;

/** Cards default to live prod. Set SWYCHR_CARD_SANDBOX=true only for partner sandbox. */
export function isSwychrCardSandbox(): boolean {
  return Deno.env.get("SWYCHR_CARD_SANDBOX") === "true";
}

const SUITE_BASE: Record<SwychrSuite, string> = {
  payin: `${API_HOST}/api/payin`,
  payout: `${API_HOST}/api/payout`,
  card: isSwychrCardSandbox()
    ? `${API_HOST}/api/card/sandbox`
    : `${API_HOST}/api/card/prod`,
  airtime: `${API_HOST}/api/airtime/prod`,
};

const tokenCache = new Map<SwychrSuite, { token: string; expiresAt: number }>();

function envCreds(suite: SwychrSuite): { email: string; password: string } | null {
  const prefix = suite.toUpperCase();
  const email = Deno.env.get(`SWYCHR_${prefix}_EMAIL`)?.trim()
    || Deno.env.get("SWYCHR_EMAIL")?.trim();
  const password = Deno.env.get(`SWYCHR_${prefix}_PASSWORD`)?.trim()
    || Deno.env.get("SWYCHR_PASSWORD")?.trim();
  if (!email || !password) return null;
  return { email, password };
}

export function isSwychrConfigured(suite: SwychrSuite): boolean {
  return envCreds(suite) !== null;
}

export function isSwychrEnabled(): boolean {
  return Deno.env.get("SWYCHR_ENABLED") === "true";
}

export function swychrSuiteBase(suite: SwychrSuite): string {
  return SUITE_BASE[suite];
}

/** Drop cached token so the next call re-authenticates. */
export function clearSwychrToken(suite?: SwychrSuite): void {
  if (suite) tokenCache.delete(suite);
  else tokenCache.clear();
}

async function loginSuite(suite: SwychrSuite): Promise<string> {
  const creds = envCreds(suite);
  if (!creds) throw new Error(`Swychr ${suite} credentials not configured`);

  let url: string;
  let body: Record<string, string>;

  if (suite === "airtime") {
    url = `${SUITE_BASE.airtime}/auth/login`;
    body = creds;
  } else if (suite === "card") {
    url = `${SUITE_BASE.card}/admin/login`;
    body = creds;
  } else {
    url = `${SUITE_BASE[suite]}/admin/auth`;
    body = creds;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(raw); } catch { /* ignore */ }

  if (!res.ok) {
    throw new Error(
      (json.message as string) || (json.error as string) || `Swychr ${suite} auth failed (${res.status})`,
    );
  }

  const token = extractBearerToken(json);
  if (!token) throw new Error(`Swychr ${suite} auth returned no token`);

  tokenCache.set(suite, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

function extractBearerToken(json: Record<string, unknown>): string {
  if (typeof json.token === "string" && json.token.length > 10) return json.token;
  if (typeof json.access_token === "string" && json.access_token.length > 10) {
    return json.access_token;
  }
  const data = json.data;
  if (typeof data === "string" && data.length > 10) return data;
  if (data && typeof data === "object") {
    const nested = data as Record<string, unknown>;
    if (typeof nested.token === "string" && nested.token.length > 10) return nested.token;
    if (typeof nested.access_token === "string" && nested.access_token.length > 10) {
      return nested.access_token;
    }
  }
  return "";
}

export async function getSwychrToken(suite: SwychrSuite, forceRefresh = false): Promise<string> {
  if (forceRefresh) clearSwychrToken(suite);
  const cached = tokenCache.get(suite);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  return loginSuite(suite);
}

export async function swychrFetch(
  suite: SwychrSuite,
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<Response> {
  const base = SUITE_BASE[suite];
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const withAuth = init.auth !== false;
  if (withAuth) {
    const token = await getSwychrToken(suite);
    headers.set("Authorization", `Bearer ${token}`);
  }

  const { auth: _auth, ...fetchInit } = init;
  let res = await fetch(`${base}${cleanPath}`, { ...fetchInit, headers });

  // Expired / revoked token — clear cache, re-login once, retry
  if (withAuth && res.status === 401) {
    clearSwychrToken(suite);
    const token = await getSwychrToken(suite, true);
    headers.set("Authorization", `Bearer ${token}`);
    res = await fetch(`${base}${cleanPath}`, { ...fetchInit, headers });
  }

  return res;
}
