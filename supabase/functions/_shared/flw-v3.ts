// Flutterwave V3 shared helper. Uses FLW_SECRET_KEY (FLWSECK-...) bearer auth.
// Route through a Cloudflare Worker reverse proxy (FLW_PROXY_URL) so Flutterwave
// can whitelist a stable egress IP — Supabase Edge has no static IP.
// Default matches Fincra / Lenhub so payouts still work if the secret is missing.
const DEFAULT_PROXY = "https://efin-flw-proxy.ukwenzyb.workers.dev";
const PROXY_BASE = (
  Deno.env.get("FLW_PROXY_URL")?.trim() ||
  (Deno.env.get("FLW_USE_PROXY") === "false" ? "https://api.flutterwave.com" : DEFAULT_PROXY)
).replace(/\/+$/, "");
export const FLW_V3_BASE = `${PROXY_BASE}/v3`;

export interface FlwV3Result { ok: boolean; status: number; json: any; }

export async function flwV3Fetch(path: string, opts: RequestInit & { timeoutMs?: number } = {}): Promise<FlwV3Result> {
  const secret = (Deno.env.get("FLW_SECRET_KEY") || "").trim();
  if (!secret) return { ok: false, status: 0, json: { message: "FLW_SECRET_KEY is not configured" } };
  const url = path.startsWith("http") ? path : `${FLW_V3_BASE}${path}`;
  const headers = new Headers(opts.headers || {});
  headers.set("Authorization", `Bearer ${secret}`);
  if (opts.method && opts.method !== "GET" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(1000, Number(opts.timeoutMs) || 15_000));
  try {
    const t0 = Date.now();
    console.log(`[FLW V3 REQ] ${opts.method || "GET"} ${url} body=`, typeof opts.body === "string" ? String(opts.body).slice(0, 800) : "<none>");
    const res = await fetch(url, { ...opts, headers, signal: ctrl.signal });
    clearTimeout(t);
    const text = await res.text();
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    console.log(`[FLW V3 RES] ${opts.method || "GET"} ${path} -> ${res.status} in ${Date.now() - t0}ms body=`, JSON.stringify(json).slice(0, 1200));
    const success = res.ok && (json?.status === "success" || json?.status === "successful");
    // If the proxy/upstream returned a non-2xx and we don't have a structured
    // message yet, surface the raw body (or status text) so callers can show
    // the exact provider error (e.g. "IP Authorization required").
    if (!success) {
      const existing = json?.message || json?.error;
      if (!existing) {
        const detail = (typeof json?.raw === "string" && json.raw.trim())
          ? json.raw.trim()
          : (text && text.trim()) || res.statusText || `HTTP ${res.status}`;
        json = { ...json, message: detail.slice(0, 1000), http_status: res.status };
      } else {
        json.http_status = res.status;
      }
    }
    return { ok: success, status: res.status, json };
  } catch (err) {
    clearTimeout(t);
    console.error(`[FLW V3 NETERR] ${opts.method || "GET"} ${path}:`, err instanceof Error ? err.message : String(err));
    return { ok: false, status: 0, json: { message: err instanceof Error ? err.message : "network error" } };
  }
}
