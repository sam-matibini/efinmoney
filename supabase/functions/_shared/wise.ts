/** Shared Wise API helpers (personal token / Platform API). */
const LIVE_BASE = "https://api.wise.com";
const SANDBOX_BASE = "https://api.sandbox.transferwise.tech";

export function getWiseConfig() {
  const env = (Deno.env.get("WISE_ENV") || "production").toLowerCase();
  const sandbox = env === "sandbox" || env === "test";
  return {
    sandbox,
    baseUrl: (Deno.env.get("WISE_BASE_URL") || (sandbox ? SANDBOX_BASE : LIVE_BASE)).replace(/\/+$/, ""),
    apiToken: Deno.env.get("WISE_API_TOKEN")?.trim() || "",
    profileId: Deno.env.get("WISE_PROFILE_ID")?.trim() || "",
  };
}

export type WiseFetchResult = {
  ok: boolean;
  status: number;
  json: unknown;
  text: string;
  scaApproval: string | null;
  scaResult: string | null;
};

export async function wiseFetch(
  path: string,
  opts: { method?: string; body?: string; query?: Record<string, string> } = {},
): Promise<WiseFetchResult> {
  const cfg = getWiseConfig();
  if (!cfg.apiToken) throw new Error("WISE_API_TOKEN not configured");

  const url = new URL(`${cfg.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    method: opts.method || (opts.body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body,
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return {
    ok: res.ok,
    status: res.status,
    json,
    text,
    scaApproval: res.headers.get("x-2fa-approval"),
    scaResult: res.headers.get("x-2fa-approval-result"),
  };
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Safe token shape for diagnostics (never return the secret). */
export function wiseTokenDiagnostics() {
  const cfg = getWiseConfig();
  const token = cfg.apiToken;
  return {
    has_token: Boolean(token),
    token_length: token.length,
    token_looks_like_uuid: token ? looksLikeUuid(token) : false,
    token_prefix: token ? `${token.slice(0, 4)}…` : null,
    profile_id_secret_set: Boolean(cfg.profileId),
    profile_id_looks_like_uuid: cfg.profileId ? looksLikeUuid(cfg.profileId) : false,
    env: cfg.sandbox ? "sandbox" : "production",
  };
}

/**
 * Wise account-details / balances need a numeric profile id.
 * WISE_PROFILE_ID may be wrong (e.g. webhook subscription UUID) — fall back to business/first profile.
 */
export async function resolveWiseProfileId(): Promise<string> {
  const cfg = getWiseConfig();
  const preferred = cfg.profileId;

  const profilesRes = await wiseFetch("/v2/profiles");
  if (!profilesRes.ok) {
    const hint = profilesRes.status === 401 || profilesRes.status === 403
      ? " Token rejected — in Wise open API tokens → Copy key, then: supabase secrets set WISE_API_TOKEN=… and redeploy wise-topup-intent."
      : "";
    throw new Error(
      `Wise list profiles failed (${profilesRes.status}): ${JSON.stringify(profilesRes.json).slice(0, 200)}.${hint}`,
    );
  }
  const profiles = Array.isArray(profilesRes.json)
    ? profilesRes.json as Array<Record<string, unknown>>
    : [];

  const profile =
    (preferred ? profiles.find((p) => String(p.id) === preferred) : null) ||
    profiles.find((p) => String(p.type).toLowerCase() === "business") ||
    profiles[0] ||
    null;

  if (!profile?.id) {
    throw new Error("No Wise profiles returned for this API token");
  }
  return String(profile.id);
}
