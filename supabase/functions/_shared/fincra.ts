const SANDBOX_BASE = "https://sandboxapi.fincra.com";
const LIVE_BASE = "https://api.fincra.com";
/** Cloudflare Worker path prefix — same pattern as FLW_PROXY_URL for Flutterwave. */
const DEFAULT_PROXY = "https://efin-flw-proxy.ukwenzyb.workers.dev";

export interface FincraConfig {
  mode: "live" | "sandbox";
  baseUrl: string;
  secretKey: string | undefined;
  publicKey: string | undefined;
  webhookSecret: string | undefined;
  businessId: string | undefined;
}

export function getFincraConfig(): FincraConfig {
  const envRaw = (Deno.env.get("FINCRA_ENV") ?? "sandbox").trim().toLowerCase();
  const isLive = ["live", "production", "prod", "1", "true"].includes(envRaw);

  // Prefer explicit FINCRA_BASE_URL.
  // Else route via Cloudflare Worker (same pattern as FLW_PROXY_URL) so Fincra
  // can whitelist Worker egress — Supabase Edge has no static IP.
  const explicit = Deno.env.get("FINCRA_BASE_URL")?.trim();
  const proxyRoot = (
    Deno.env.get("FINCRA_PROXY_URL")?.trim() ||
    Deno.env.get("FLW_PROXY_URL")?.trim() ||
    DEFAULT_PROXY
  ).replace(/\/+$/, "");
  const useProxy = Deno.env.get("FINCRA_USE_PROXY") !== "false";
  const viaProxy = `${proxyRoot}/${isLive ? "fincra" : "fincra-sandbox"}`;
  const direct = isLive ? LIVE_BASE : SANDBOX_BASE;
  const baseUrl = (explicit || (useProxy ? viaProxy : direct)).replace(/\/+$/, "");

  return {
    mode: isLive ? "live" : "sandbox",
    baseUrl,
    secretKey: Deno.env.get("FINCRA_SECRET_KEY")?.trim() || undefined,
    publicKey: Deno.env.get("FINCRA_PUBLIC_KEY")?.trim() || undefined,
    webhookSecret: Deno.env.get("FINCRA_WEBHOOK_SECRET")?.trim() || undefined,
    businessId: Deno.env.get("FINCRA_BUSINESS_ID")?.trim() || undefined,
  };
}

/** Fincra checkout requires a public HTTPS redirect URL — localhost/http are rejected. */
export function normalizeFincraRedirectUrl(raw: string): string {
  const fallbackBase = (Deno.env.get("APP_URL") || "https://www.efin.money").replace(/\/+$/, "");
  try {
    const u = new URL(raw);
    const isLocal =
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname.endsWith(".local");
    if (isLocal || u.protocol !== "https:") {
      return new URL(u.pathname + u.search, fallbackBase).toString();
    }
    return u.toString();
  } catch {
    return `${fallbackBase}/wallet/topup`;
  }
}

export async function fincraFetch(
  path: string,
  opts: {
    method?: string;
    body?: string;
    /** Checkout endpoints require the public key header */
    withPublicKey?: boolean;
    /** Verify endpoints require business id */
    withBusinessId?: boolean;
    timeoutMs?: number;
  } = {},
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const cfg = getFincraConfig();
  if (!cfg.secretKey) throw new Error("FINCRA_SECRET_KEY not configured");

  const headers: Record<string, string> = {
    Accept: "application/json",
    "api-key": cfg.secretKey,
  };
  if (opts.body) headers["Content-Type"] = "application/json";
  if (opts.withPublicKey) {
    if (!cfg.publicKey) throw new Error("FINCRA_PUBLIC_KEY not configured");
    headers["x-pub-key"] = cfg.publicKey;
  }
  if (opts.withBusinessId) {
    if (!cfg.businessId) throw new Error("FINCRA_BUSINESS_ID not configured");
    headers["x-business-id"] = cfg.businessId;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers,
      body: opts.body,
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}
