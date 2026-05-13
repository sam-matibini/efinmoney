// Flutterwave V3 shared helper. Uses FLW_SECRET_KEY (FLWSECK-...) bearer auth.
export const FLW_V3_BASE = "https://api.flutterwave.com/v3";

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
    return { ok: success, status: res.status, json };
  } catch (err) {
    clearTimeout(t);
    console.error(`[FLW V3 NETERR] ${opts.method || "GET"} ${path}:`, err instanceof Error ? err.message : String(err));
    return { ok: false, status: 0, json: { message: err instanceof Error ? err.message : "network error" } };
  }
}
