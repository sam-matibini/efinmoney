/**
 * Official Nomba Developer API (api.nomba.com / sandbox.nomba.com).
 * Distinct from Lenhub-wrapped "NOMBA_PAY_*" collection paths in nomba-pay.ts.
 *
 * Secrets: NOMBA_CLIENT_ID, NOMBA_CLIENT_SECRET, NOMBA_ACCOUNT_ID,
 * optional NOMBA_API_BASE (default https://api.nomba.com), NOMBA_ENV=live|sandbox
 */

export type NombaApiConfig = {
  clientId: string;
  clientSecret: string;
  accountId: string;
  apiBase: string;
  environment: "live" | "sandbox";
};

export function getNombaApiConfig(): NombaApiConfig {
  const environment = (Deno.env.get("NOMBA_ENV") || "live").trim().toLowerCase() === "sandbox"
    ? "sandbox"
    : "live";
  const apiBase = (Deno.env.get("NOMBA_API_BASE") || (
    environment === "sandbox" ? "https://sandbox.nomba.com" : "https://api.nomba.com"
  )).trim().replace(/\/+$/, "");
  return {
    clientId: (Deno.env.get("NOMBA_CLIENT_ID") || "").trim(),
    clientSecret: (Deno.env.get("NOMBA_CLIENT_SECRET") || "").trim(),
    accountId: (Deno.env.get("NOMBA_ACCOUNT_ID") || "").trim(),
    apiBase,
    environment,
  };
}

export function nombaApiConfigured(cfg = getNombaApiConfig()): boolean {
  return !!(cfg.clientId && cfg.clientSecret && cfg.accountId);
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export async function getNombaAccessToken(): Promise<string> {
  const cfg = getNombaApiConfig();
  if (!nombaApiConfigured(cfg)) throw new Error("Nomba API not configured (NOMBA_CLIENT_ID/SECRET/ACCOUNT_ID)");

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const res = await fetch(`${cfg.apiBase}/v1/auth/token/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accountId: cfg.accountId,
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });
  const json = await res.json().catch(() => ({})) as {
    code?: string;
    description?: string;
    data?: { access_token?: string; expiresAt?: string };
  };
  if (!res.ok || json.code !== "00" || !json.data?.access_token) {
    throw new Error(json.description || `Nomba OAuth failed (${res.status})`);
  }
  const expiresAt = json.data.expiresAt ? Date.parse(json.data.expiresAt) : Date.now() + 25 * 60_000;
  cachedToken = { accessToken: json.data.access_token, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 25 * 60_000 };
  return cachedToken.accessToken;
}

export async function nombaApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; json: any }> {
  const cfg = getNombaApiConfig();
  const token = await getNombaAccessToken();
  const res = await fetch(`${cfg.apiBase}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      accountId: cfg.accountId,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && (json?.code === "00" || json?.code == null), status: res.status, json };
}

/** Create a Nomba Checkout order; returns hosted checkout URL. */
export async function createNombaCheckoutOrder(params: {
  amount: number;
  currency: string;
  callbackUrl: string;
  customerEmail?: string;
  orderReference?: string;
  meta?: Record<string, string>;
}): Promise<{ ok: true; checkoutLink: string; orderReference: string } | { ok: false; error: string }> {
  const cfg = getNombaApiConfig();
  const amountStr = params.amount.toFixed(2);
  const { ok, status, json } = await nombaApiFetch("/v1/checkout/order", {
    method: "POST",
    body: JSON.stringify({
      order: {
        amount: amountStr,
        currency: params.currency.toUpperCase(),
        callbackUrl: params.callbackUrl,
        customerEmail: params.customerEmail,
        orderReference: params.orderReference,
        accountId: cfg.accountId,
        orderMetaData: params.meta,
      },
    }),
  });
  if (!ok) {
    return { ok: false, error: String(json?.description || json?.message || `Nomba checkout HTTP ${status}`) };
  }
  const checkoutLink = String(json?.data?.checkoutLink || "");
  const orderReference = String(json?.data?.orderReference || "");
  if (!checkoutLink) return { ok: false, error: "Nomba returned no checkout link" };
  return { ok: true, checkoutLink, orderReference };
}
