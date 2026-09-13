/**
 * Nuvei Payment Middleware client (sandbox).
 * Host: https://devapi.nuveiconnect.com
 * Docs: https://www.nuveiplatforms.com/payment-middleware.html
 */

export const NUVEI_MW_SANDBOX_BASE = "https://devapi.nuveiconnect.com";
export const NUVEI_MW_DEFAULT_GATEWAY = "CheckCommerce";

export type NuveiConfig = {
  baseUrl: string;
  gateway: string;
  settingsJson: string;
  credentialsToken: string;
};

export function getNuveiConfig(): NuveiConfig {
  const baseUrl = (Deno.env.get("NUVEI_MW_BASE_URL") || NUVEI_MW_SANDBOX_BASE).replace(/\/+$/, "");
  const gateway = (Deno.env.get("NUVEI_MW_GATEWAY") || NUVEI_MW_DEFAULT_GATEWAY).trim();
  return {
    baseUrl,
    gateway,
    settingsJson: (Deno.env.get("NUVEI_MW_SETTINGS_JSON") || "").trim(),
    credentialsToken: (Deno.env.get("NUVEI_MW_CREDENTIALS") || "").trim(),
  };
}

export function nuveiConfigured(cfg = getNuveiConfig()): boolean {
  return !!(cfg.credentialsToken || cfg.settingsJson);
}

export async function nuveiFetch(
  path: string,
  init: RequestInit & { gateway?: string; credentials?: string } = {},
): Promise<{ ok: boolean; status: number; json: unknown; text: string }> {
  const cfg = getNuveiConfig();
  const url = `${cfg.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Version": "3",
    "X-Gateway": init.gateway || cfg.gateway,
    ...(init.headers as Record<string, string> | undefined),
  };
  const token = init.credentials || cfg.credentialsToken;
  if (token) headers["X-Credentials"] = token;
  const { gateway: _g, credentials: _c, headers: _h, ...rest } = init;
  const r = await fetch(url, { ...rest, headers });
  const text = await r.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { ok: r.ok, status: r.status, json, text };
}

export async function nuveiListGateways(): Promise<{ ok: boolean; status: number; json: unknown }> {
  return nuveiFetch("/api/gateway/list", { method: "GET" });
}

export async function nuveiGatewaySettings(gateway?: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  const cfg = getNuveiConfig();
  const name = encodeURIComponent(gateway || cfg.gateway);
  return nuveiFetch(`/api/gateway/settings/${name}`, { method: "GET", gateway: gateway || cfg.gateway });
}

export async function nuveiExchangeCredentials(settings?: Record<string, unknown>): Promise<{
  ok: boolean;
  status: number;
  json: unknown;
}> {
  const cfg = getNuveiConfig();
  let body: Record<string, unknown> = {};
  if (settings && Object.keys(settings).length) body = settings;
  else if (cfg.settingsJson) {
    try {
      body = JSON.parse(cfg.settingsJson) as Record<string, unknown>;
    } catch {
      return { ok: false, status: 400, json: { error: "NUVEI_MW_SETTINGS_JSON is not valid JSON" } };
    }
  }
  return nuveiFetch("/api/gateway/credentials", { method: "POST", body: JSON.stringify(body) });
}

export function buildNuveiCadEftSale(opts: {
  amount: number;
  orderId: string;
  name: string;
  email: string;
  customerId: string;
}): Record<string, unknown> {
  const amount = Math.round(Number(opts.amount) * 100) / 100;
  return {
    language: "en",
    locale: "en-CA",
    displayInIframe: true,
    isConfirm: true,
    accountBillingInfo: {
      name: opts.name,
      email: opts.email,
      customerID: opts.customerId,
      country: "CA",
    },
    transactionPayment: {
      amount: amount.toFixed(2),
      displayAmount: `C$${amount.toFixed(2)}`,
      orderId: opts.orderId,
      currencyCode: "CAD",
      currencySymbol: "C$",
      transactionType: "sale",
    },
    transactionAccountInformation: {
      createProfile: false,
      accountType: "ACH",
    },
  };
}
