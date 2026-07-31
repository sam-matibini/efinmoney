/**
 * Partner API key authentication.
 *
 * Keys look like `efk_live_<random>` and are only ever stored hashed
 * (SHA-256 hex) in `api_partner_keys.key_hash`.
 */

export interface PartnerContext {
  keyId: string;
  partnerId: string;
  partnerName: string;
  tier: string;
  rateLimitPerMin: number;
  allowedEndpoints: string[];
}

export interface AuthFailure {
  status: number;
  code: string;
  error: string;
  retryAfter?: number;
}

type Sb = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a new raw key plus its stored hash/prefix. */
export async function generateApiKey(env: "live" | "test" = "live") {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const body = Array.from(raw).map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = `efk_${env}_${body}`;
  return { key, hash: await sha256Hex(key), prefix: key.slice(0, 16) };
}

export function readApiKey(req: Request): string | null {
  const header = req.headers.get("x-api-key");
  if (header) return header.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer efk_")) return auth.slice(7).trim();
  return null;
}

/**
 * Verify the request's API key, the partner status, endpoint scope and rate
 * limit. Returns either a partner context or a failure to render.
 */
export async function authenticatePartner(
  supabase: Sb,
  req: Request,
  endpoint: string,
): Promise<{ partner: PartnerContext } | { failure: AuthFailure }> {
  const key = readApiKey(req);
  if (!key) {
    return { failure: { status: 401, code: "missing_api_key", error: "Provide your key in the X-API-Key header" } };
  }

  const hash = await sha256Hex(key);
  const { data, error } = await supabase.rpc("verify_api_key", { p_hash: hash });
  if (error) {
    console.error("[partner-api] verify_api_key failed", error);
    return { failure: { status: 500, code: "auth_error", error: "Could not verify API key" } };
  }

  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  if (!row) {
    return { failure: { status: 401, code: "invalid_api_key", error: "Invalid or revoked API key" } };
  }
  if (String(row.status) !== "active") {
    return { failure: { status: 403, code: "partner_inactive", error: `Partner account is ${row.status}` } };
  }

  const allowed = (row.allowed_endpoints as string[] | null) ?? [];
  if (allowed.length && !allowed.includes(endpoint)) {
    return { failure: { status: 403, code: "endpoint_forbidden", error: `Your key is not scoped for '${endpoint}'` } };
  }

  const limit = Number(row.rate_limit_per_min ?? 60) || 60;
  const { data: allowedNow, error: rlError } = await supabase.rpc("check_rate_limit", {
    p_key: `api_partner:${row.partner_id}`,
    p_max_requests: limit,
    p_window_seconds: 60,
  });
  if (!rlError && allowedNow === false) {
    return {
      failure: {
        status: 429,
        code: "rate_limited",
        error: `Rate limit of ${limit} requests/minute exceeded`,
        retryAfter: 60,
      },
    };
  }

  return {
    partner: {
      keyId: String(row.key_id),
      partnerId: String(row.partner_id),
      partnerName: String(row.partner_name ?? ""),
      tier: String(row.tier ?? "standard"),
      rateLimitPerMin: limit,
      allowedEndpoints: allowed,
    },
  };
}
