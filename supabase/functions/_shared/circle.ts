// Shared Circle API helpers. Uses CIRCLE_ENV to pick base URL.
const ENV = (Deno.env.get("CIRCLE_ENV") ?? "production").toLowerCase();
export const CIRCLE_BASE_URL = ENV === "sandbox"
  ? "https://api-sandbox.circle.com"
  : "https://api.circle.com";

export const CIRCLE_API_KEY = Deno.env.get("CIRCLE_API_KEY") ?? "";
export const CIRCLE_ORIGINATOR_ID = Deno.env.get("CIRCLE_CPN_ORIGINATOR_ID") ?? "";
export const CIRCLE_DEPOSIT_ADDRESS = Deno.env.get("CIRCLE_USDC_DEPOSIT_ADDRESS") ?? "";

export interface CircleFetchOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  idempotencyKey?: string;
}

export async function circleFetch<T = any>({ method = "GET", path, body, idempotencyKey }: CircleFetchOpts): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  if (!CIRCLE_API_KEY) {
    return { ok: false, status: 500, data: null, error: "CIRCLE_API_KEY not configured" };
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${CIRCLE_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;

  try {
    const res = await fetch(`${CIRCLE_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
    if (!res.ok) {
      const errMsg = parsed?.message ?? parsed?.error ?? `Circle API ${res.status}`;
      return { ok: false, status: res.status, data: parsed, error: errMsg };
    }
    return { ok: true, status: res.status, data: parsed };
  } catch (err: any) {
    return { ok: false, status: 0, data: null, error: err?.message ?? "Network error" };
  }
}
