/**
 * Dodo Payments shared client (Merchant of Record checkout).
 * Live: https://live.dodopayments.com
 * Test: https://test.dodopayments.com
 *
 * Env:
 *   DODO_PAYMENTS_API_KEY (required)
 *   DODO_PAYMENTS_ENV = live | test (default live)
 *   DODO_PAYMENTS_WEBHOOK_KEY (webhook signing secret)
 *   DODO_PRODUCT_ID (optional — pay_what_you_want product; auto-created if missing)
 */

const LIVE_BASE = "https://live.dodopayments.com";
const TEST_BASE = "https://test.dodopayments.com";

export interface DodoConfig {
  apiKey: string;
  baseUrl: string;
  webhookKey: string | undefined;
  env: "live" | "test";
}

export function getDodoConfig(): DodoConfig {
  const envRaw = (Deno.env.get("DODO_PAYMENTS_ENV") || Deno.env.get("DODO_ENV") || "live")
    .trim()
    .toLowerCase();
  const isTest = envRaw === "test" || envRaw === "sandbox";
  return {
    apiKey: (Deno.env.get("DODO_PAYMENTS_API_KEY") || Deno.env.get("DODO_API_KEY") || "").trim(),
    baseUrl: (Deno.env.get("DODO_PAYMENTS_BASE_URL") || (isTest ? TEST_BASE : LIVE_BASE)).replace(/\/+$/, ""),
    webhookKey: (Deno.env.get("DODO_PAYMENTS_WEBHOOK_KEY") || Deno.env.get("DODO_WEBHOOK_SECRET") || "").trim() || undefined,
    env: isTest ? "test" : "live",
  };
}

export function isDodoConfigured(): boolean {
  return Boolean(getDodoConfig().apiKey);
}

export type DodoResult = { ok: boolean; status: number; json: Record<string, unknown> };

export async function dodoFetch(
  path: string,
  init: RequestInit & { json?: Record<string, unknown> } = {},
): Promise<DodoResult> {
  const cfg = getDodoConfig();
  if (!cfg.apiKey) return { ok: false, status: 0, json: { message: "DODO_PAYMENTS_API_KEY not configured" } };

  const url = path.startsWith("http") ? path : `${cfg.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${cfg.apiKey}`);
  headers.set("Accept", "application/json");
  if (init.json || (init.body && !headers.has("Content-Type"))) {
    headers.set("Content-Type", "application/json");
  }

  const body = init.json ? JSON.stringify(init.json) : init.body;
  const res = await fetch(url, { ...init, headers, body });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 800) };
  }
  if (!res.ok && !json.message && !json.error) {
    json.message = (typeof json.raw === "string" && json.raw) || res.statusText || `HTTP ${res.status}`;
  }
  return { ok: res.ok, status: res.status, json };
}

/** Zero-decimal currencies — amount is already the minor unit. */
const ZERO_DECIMAL = new Set(["UGX", "RWF", "JPY", "KRW", "VND"]);

export function toMinorUnits(amount: number, currency: string): number {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return Math.round(amount);
  return Math.round(amount * 100);
}

export function fromMinorUnits(minor: number, currency: string): number {
  const c = currency.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return minor;
  return Math.round(minor) / 100;
}

/**
 * Resolve (or create) a pay-what-you-want one-time product for wallet top-ups.
 * Cached per currency via Deno env DODO_PRODUCT_ID_<CCY> or DODO_PRODUCT_ID.
 */
export async function ensureTopupProduct(currency: string): Promise<string> {
  const ccy = currency.toUpperCase();
  const explicit =
    Deno.env.get(`DODO_PRODUCT_ID_${ccy}`)?.trim() ||
    Deno.env.get("DODO_PRODUCT_ID")?.trim();
  if (explicit) return explicit;

  const name = `eFinMoney Wallet Top-up (${ccy})`;
  const list = await dodoFetch("/products?page_size=100", { method: "GET" });
  const items = Array.isArray(list.json?.items)
    ? (list.json.items as Array<Record<string, unknown>>)
    : Array.isArray(list.json?.data)
      ? (list.json.data as Array<Record<string, unknown>>)
      : [];
  const existing = items.find((p) => String(p.name || "") === name);
  if (existing?.product_id) return String(existing.product_id);

  const created = await dodoFetch("/products", {
    method: "POST",
    json: {
      name,
      description: `Dynamic wallet top-up for eFinMoney ${ccy} wallets`,
      tax_category: "saas",
      price: {
        type: "one_time_price",
        currency: ccy,
        price: toMinorUnits(1, ccy), // minimum $1 / equivalent
        discount: 0,
        purchasing_power_parity: false,
        pay_what_you_want: true,
      },
      metadata: { efm_type: "wallet_topup", currency: ccy },
    },
  });
  const id = String(created.json?.product_id || "");
  if (!created.ok || !id) {
    throw new Error(
      String(created.json?.message || created.json?.error || `Could not create Dodo product for ${ccy}`),
    );
  }
  return id;
}
