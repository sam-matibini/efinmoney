/** PayPal REST (Orders v2) — Client ID + Secret, no Braintree. */

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  environment: "sandbox" | "live";
  apiBase: string;
};

export function getPayPalConfig(): PayPalConfig {
  const clientId = (Deno.env.get("PAYPAL_CLIENT_ID") || "").trim();
  const clientSecret = (Deno.env.get("PAYPAL_CLIENT_SECRET") || "").trim();
  const environment = (Deno.env.get("PAYPAL_ENVIRONMENT") || "sandbox").trim().toLowerCase() === "live"
    ? "live"
    : "sandbox";
  const apiBase = environment === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
  return { clientId, clientSecret, environment, apiBase };
}

export function paypalConfigured(cfg = getPayPalConfig()): boolean {
  return !!(cfg.clientId && cfg.clientSecret);
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export async function getPayPalAccessToken(): Promise<string> {
  const cfg = getPayPalConfig();
  if (!paypalConfigured(cfg)) throw new Error("PayPal not configured");

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const basic = btoa(`${cfg.clientId}:${cfg.clientSecret}`);
  const res = await fetch(`${cfg.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = await res.json().catch(() => ({})) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || `PayPal OAuth failed (${res.status})`);
  }
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 300) * 1000,
  };
  return json.access_token;
}

export async function paypalFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; json: any }> {
  const cfg = getPayPalConfig();
  const token = await getPayPalAccessToken();
  const res = await fetch(`${cfg.apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function createPayPalOrder(params: {
  amount: number;
  currency: string;
  customId: string;
  description?: string;
}): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  const amountStr = params.amount.toFixed(2);
  const { ok, status, json } = await paypalFetch("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: params.currency.toUpperCase(),
            value: amountStr,
          },
          custom_id: params.customId.slice(0, 127),
          description: (params.description || `eFinMoney ${params.currency} top-up`).slice(0, 127),
        },
      ],
      application_context: {
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
    }),
  });
  if (!ok) {
    const detail = String(json?.message || json?.details?.[0]?.description || `PayPal HTTP ${status}`);
    return { ok: false, error: detail };
  }
  const orderId = String(json?.id || "");
  if (!orderId) return { ok: false, error: "PayPal returned no order id" };
  return { ok: true, orderId };
}

export async function capturePayPalOrder(orderId: string): Promise<{
  ok: true;
  captureId: string;
  status: string;
  amount: number;
  currency: string;
} | { ok: false; error: string }> {
  const { ok, status, json } = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  // Already captured — fetch order
  if (!ok && status === 422) {
    const get = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
    if (get.ok && String(get.json?.status || "").toUpperCase() === "COMPLETED") {
      return extractCapture(get.json);
    }
  }

  if (!ok) {
    const detail = String(json?.message || json?.details?.[0]?.description || `PayPal capture HTTP ${status}`);
    return { ok: false, error: detail };
  }
  return extractCapture(json);
}

function extractCapture(order: any): {
  ok: true;
  captureId: string;
  status: string;
  amount: number;
  currency: string;
} | { ok: false; error: string } {
  const orderStatus = String(order?.status || "").toUpperCase();
  const units = order?.purchase_units || [];
  const captures = units[0]?.payments?.captures || [];
  const capture = captures[0] || {};
  const captureId = String(capture.id || order?.id || "");
  const value = Number(capture.amount?.value || units[0]?.amount?.value || 0);
  const currency = String(capture.amount?.currency_code || units[0]?.amount?.currency_code || "").toUpperCase();
  const capStatus = String(capture.status || orderStatus).toUpperCase();

  if (!captureId) return { ok: false, error: "PayPal returned no capture id" };
  if (orderStatus !== "COMPLETED" && capStatus !== "COMPLETED") {
    return { ok: false, error: `Payment status ${capStatus || orderStatus}` };
  }
  return {
    ok: true,
    captureId,
    status: capStatus || orderStatus,
    amount: Number.isFinite(value) ? value : 0,
    currency,
  };
}
