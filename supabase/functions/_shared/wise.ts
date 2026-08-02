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

export async function wiseFetch(
  path: string,
  opts: { method?: string; body?: string; query?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; json: unknown }> {
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
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
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
    throw new Error(
      `Wise list profiles failed (${profilesRes.status}): ${JSON.stringify(profilesRes.json).slice(0, 200)}`,
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
