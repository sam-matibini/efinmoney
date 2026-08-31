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
  const explicit = Deno.env.get("NOMBA_API_BASE")?.trim();
  const proxyUrl = (Deno.env.get("NOMBA_PROXY_URL") || Deno.env.get("FLW_PROXY_URL") || "").trim().replace(/\/+$/, "");
  // Nomba requires whitelisted IPv4. Do NOT default to Cloudflare Worker (often IPv6-only).
  // Set NOMBA_API_BASE to your VPS proxy, e.g. http://203.0.113.10:8787/nomba
  let apiBase = explicit
    || (proxyUrl ? `${proxyUrl}/nomba` : "")
    || (environment === "sandbox" ? "https://sandbox.nomba.com" : "https://api.nomba.com");
  if (environment === "sandbox" && !explicit && proxyUrl) {
    apiBase = `${proxyUrl}/nomba-sandbox`;
  }
  apiBase = apiBase.replace(/\/+$/, "");
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

/**
 * Checkout/collect API base.
 * When Nomba IP whitelist is on, ALL APIs (checkout + payout) must egress the whitelisted IP (VPS).
 * Override with NOMBA_CHECKOUT_API_BASE only if Nomba confirms checkout is exempt from IP lock.
 */
export function getNombaCheckoutApiBase(): string {
  const explicit = Deno.env.get("NOMBA_CHECKOUT_API_BASE")?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const payoutBase = Deno.env.get("NOMBA_API_BASE")?.trim();
  if (payoutBase) return payoutBase.replace(/\/+$/, "");
  const environment = (Deno.env.get("NOMBA_ENV") || "live").trim().toLowerCase();
  return environment === "sandbox" ? "https://sandbox.nomba.com" : "https://api.nomba.com";
}

function nombaUsesVpsProxy(apiBase: string): boolean {
  const cfg = getNombaApiConfig();
  return apiBase.replace(/\/+$/, "") === cfg.apiBase.replace(/\/+$/, "")
    && !!apiBase && !apiBase.includes("api.nomba.com");
}

type NombaFetchOpts = {
  /** Override API host (e.g. direct api.nomba.com for checkout). */
  apiBase?: string;
  /** Send x-proxy-secret when calling through the VPS proxy. */
  useProxySecret?: boolean;
};

const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

export async function getNombaAccessToken(opts: NombaFetchOpts = {}): Promise<string> {
  const cfg = getNombaApiConfig();
  if (!nombaApiConfigured(cfg)) throw new Error("Nomba API not configured (NOMBA_CLIENT_ID/SECRET/ACCOUNT_ID)");

  const apiBase = (opts.apiBase || cfg.apiBase).replace(/\/+$/, "");
  const cached = tokenCache.get(apiBase);
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.accessToken;
  }

  const proxySecret = (Deno.env.get("NOMBA_PROXY_SECRET") || "").trim();
  const sendProxySecret = opts.useProxySecret !== false && !!proxySecret && apiBase === cfg.apiBase;

  const res = await fetch(`${apiBase}/v1/auth/token/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accountId: cfg.accountId,
      ...(sendProxySecret ? { "x-proxy-secret": proxySecret } : {}),
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
  tokenCache.set(apiBase, {
    accessToken: json.data.access_token,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 25 * 60_000,
  });
  return json.data.access_token;
}

export async function nombaApiFetch(
  path: string,
  init: RequestInit = {},
  opts: NombaFetchOpts = {},
): Promise<{ ok: boolean; status: number; json: any }> {
  const cfg = getNombaApiConfig();
  const apiBase = (opts.apiBase || cfg.apiBase).replace(/\/+$/, "");
  const token = await getNombaAccessToken(opts);
  const proxySecret = (Deno.env.get("NOMBA_PROXY_SECRET") || "").trim();
  const sendProxySecret = opts.useProxySecret !== false && !!proxySecret && apiBase === cfg.apiBase;
  const res = await fetch(`${apiBase}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      accountId: cfg.accountId,
      ...(sendProxySecret ? { "x-proxy-secret": proxySecret } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && (json?.code === "00" || json?.code == null), status: res.status, json };
}

/** Checkout + transaction requery — same whitelisted egress as payouts when VPS is configured. */
async function nombaCheckoutApiFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; json: any }> {
  const checkoutBase = getNombaCheckoutApiBase();
  return nombaApiFetch(path, init, {
    apiBase: checkoutBase,
    useProxySecret: nombaUsesVpsProxy(checkoutBase),
  });
}

/** Create a Nomba Checkout order; returns hosted checkout URL. */
export async function createNombaCheckoutOrder(params: {
  amount: number;
  currency: string;
  callbackUrl: string;
  customerEmail?: string;
  orderReference?: string;
  /** Optional outlet/sub-account ID to credit (NOT the parent accountId header). */
  subAccountId?: string;
  meta?: Record<string, string>;
}): Promise<{ ok: true; checkoutLink: string; orderReference: string } | { ok: false; error: string }> {
  const amountStr = params.amount.toFixed(2);
  // Parent accountId belongs in the header only (via nombaApiFetch).
  // Body accountId is ONLY for outlet/sub-accounts — putting the parent UUID here
  // makes Nomba look up a settlement account number and fail with
  // "Invalid input: No Account Number found".
  const cfg = getNombaApiConfig();
  const subRaw = (params.subAccountId || Deno.env.get("NOMBA_SUBACCOUNT_ID") || "").trim();
  // Never put the parent account UUID in the order body — Nomba returns
  // "No Account Number found". Body accountId is for outlet/sub-accounts only.
  const subAccountId = subRaw && subRaw !== cfg.accountId ? subRaw : "";
  const order: Record<string, unknown> = {
    amount: amountStr,
    currency: params.currency.toUpperCase(),
    callbackUrl: params.callbackUrl,
    customerEmail: params.customerEmail,
    orderReference: params.orderReference,
    orderMetaData: params.meta,
  };
  if (subAccountId) order.accountId = subAccountId;

  const { ok, status, json } = await nombaCheckoutApiFetch("/v1/checkout/order", {
    method: "POST",
    body: JSON.stringify({ order }),
  });
  if (!ok) {
    return {
      ok: false,
      error: String(json?.description || json?.message || `Nomba checkout HTTP ${status}`),
      status,
      raw: json,
    };
  }
  const checkoutLink = String(json?.data?.checkoutLink || "");
  const orderReference = String(json?.data?.orderReference || "");
  if (!checkoutLink) {
    const dataMsg = String(json?.data?.message || json?.data?.description || "").trim();
    return {
      ok: false,
      error: dataMsg || "Nomba returned no checkout link",
      status,
      raw: json,
    };
  }
  return { ok: true, checkoutLink, orderReference };
}

/** Fetch checkout transaction by merchant orderReference or Nomba orderId. */
export async function fetchNombaCheckoutTransaction(params: {
  id: string;
  idType?: "ORDER_REFERENCE" | "ORDER_ID";
}): Promise<{ ok: boolean; status: number; json: any; paid: boolean }> {
  const idType = params.idType || (params.id.includes("efin-nomba") ? "ORDER_REFERENCE" : "ORDER_ID");
  const { ok, status, json } = await nombaCheckoutApiFetch(
    `/v1/checkout/transaction?idType=${encodeURIComponent(idType)}&id=${encodeURIComponent(params.id)}`,
    { method: "GET" },
  );
  const data = (json?.data ?? {}) as Record<string, unknown>;
  const details = (data.transactionDetails && typeof data.transactionDetails === "object")
    ? data.transactionDetails as Record<string, unknown>
    : {};
  const statusCode = String(details.statusCode ?? data.status ?? "").toLowerCase();
  const dataMessage = String(data.message ?? details.message ?? "").toLowerCase();
  const successFlag = String(data.success ?? "").toLowerCase();
  // Explicit unpaid / missing payment — never treat API envelope "description: success" as paid.
  const explicitUnpaid = successFlag === "false"
    || successFlag === "0"
    || dataMessage.includes("no transaction")
    || statusCode.includes("no transaction")
    || statusCode.includes("pending")
    || statusCode.includes("cancel")
    || statusCode.includes("fail")
    || statusCode.includes("unpaid");
  const bySuccessFlag = successFlag === "true" || successFlag === "1";
  const byStatus00 = statusCode === "00";
  const byStatusWord = statusCode.includes("approved")
    || statusCode.includes("success")
    || statusCode.includes("paid")
    || statusCode.includes("complete");
  // Do NOT use json.description — Nomba returns description:"success"/"Successful" for any OK lookup.
  const paid = !explicitUnpaid && (bySuccessFlag || byStatus00 || byStatusWord);
  return { ok, status, json, paid };
}

/** Domestic Nigeria bank transfer (official API — not Lenhub). */
export async function createNombaDomesticBankTransfer(params: {
  amount: number;
  accountNumber: string;
  accountName: string;
  bankCode: string;
  merchantTxRef: string;
  senderName?: string;
  narration?: string;
}): Promise<{ ok: boolean; status: number; json: any; providerRef: string | null; transferStatus: string }> {
  const { ok, status, json } = await nombaApiFetch("/v2/transfers/bank", {
    method: "POST",
    body: JSON.stringify({
      amount: params.amount,
      accountNumber: params.accountNumber,
      accountName: params.accountName,
      bankCode: params.bankCode,
      merchantTxRef: params.merchantTxRef,
      senderName: params.senderName || "eFinMoney",
      narration: params.narration || undefined,
    }),
  });
  const data = (json?.data ?? {}) as Record<string, unknown>;
  const transferStatus = String(data.status || "").toUpperCase();
  const providerRef = String(data.id || data.transactionId || "").trim() || null;
  const successish = ok || transferStatus === "SUCCESS" || transferStatus === "PENDING_BILLING" || transferStatus === "PENDING";
  return { ok: successish, status, json, providerRef, transferStatus: transferStatus || (successish ? "SUCCESS" : "FAILED") };
}

export type NombaInstitution = { code: string; displayName: string };

/** Banks or MoMo providers for a Global Payout destination. */
export async function listNombaInstitutions(params: {
  countryIsoCode: string;
  isMobileMoney: boolean;
}): Promise<{ ok: boolean; status: number; json: any; institutions: NombaInstitution[] }> {
  const q = new URLSearchParams({
    countryIsoCode: params.countryIsoCode.toUpperCase(),
    isMobileMoney: params.isMobileMoney ? "true" : "false",
  });
  const { ok, status, json } = await nombaApiFetch(
    `/v1/global-payout/bank/providers?${q.toString()}`,
    { method: "GET" },
  );
  const raw = Array.isArray(json?.data) ? json.data : [];
  const institutions = raw
    .filter((r: unknown) => r && typeof r === "object")
    .map((r: Record<string, unknown>) => ({
      code: String(r.code || "").trim(),
      displayName: String(r.displayName || r.name || "").trim(),
    }))
    .filter((i: NombaInstitution) => i.code || i.displayName);
  return { ok, status, json, institutions };
}

/** Latest FX quotes; pass exchangeRateId as lockedExchangeRateId on authorize. */
export async function fetchNombaExchangeRates(params: {
  sourceCurrency: string;
  destinationCurrency: string;
}): Promise<{ ok: boolean; status: number; json: any; exchangeRateId: string | null }> {
  const q = new URLSearchParams({
    from: params.sourceCurrency.toUpperCase(),
    to: params.destinationCurrency.toUpperCase(),
  });
  const { ok, status, json } = await nombaApiFetch(
    `/v1/global-payout/exchange-rates?${q.toString()}`,
    { method: "GET" },
  );
  const data = json?.data;
  const rates = Array.isArray(data?.rates) ? data.rates : Array.isArray(data) ? data : [];
  const first = rates[0] || (data && !Array.isArray(data) ? data : null);
  const exchangeRateId = String(
    first?.exchangeRateId || first?.id || data?.exchangeRateId || "",
  ).trim() || null;
  return { ok, status, json, exchangeRateId };
}

export type NombaAuthorizeTransferBody = Record<string, unknown>;

export async function authorizeNombaGlobalTransfer(
  body: NombaAuthorizeTransferBody,
): Promise<{ ok: boolean; status: number; json: any; transactionId: string | null; transferStatus: string }> {
  const { ok, status, json } = await nombaApiFetch("/v1/global-payout/transfer/authorize", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = (json?.data ?? {}) as Record<string, unknown>;
  const transferStatus = String(data.status || data.prettyStatus || "").toUpperCase();
  const transactionId = String(
    data.wtTransactionId || data.coreTransactionId || data.transactionId || data.id || "",
  ).trim() || null;
  const statusLooksGood = /^(SUCCESS|SUCCESSFUL|COMPLETED|SETTLED|PROCESSING|PENDING|PENDING_BILLING|INITIATED)$/i
    .test(transferStatus)
    || /PAYMENT_SUCCESS/i.test(String(data.coreStatus || ""));
  // Require a real Nomba transaction id — never treat empty/error envelopes as paid.
  // (Do not use .includes("success") — "Unsuccessful" would match.)
  const accepted = !!(ok && transactionId && statusLooksGood);
  return {
    ok: accepted,
    status,
    json,
    transactionId,
    transferStatus: transferStatus || (accepted ? "PROCESSING" : "FAILED"),
  };
}

export async function fetchNombaGlobalTransaction(
  transactionId: string,
): Promise<{ ok: boolean; status: number; json: any; transferStatus: string }> {
  const { ok, status, json } = await nombaApiFetch(
    `/v1/global-payout/transactions/${encodeURIComponent(transactionId)}`,
    { method: "GET" },
  );
  const data = (json?.data ?? {}) as Record<string, unknown>;
  const transferStatus = String(data.status || data.prettyStatus || "").toUpperCase();
  return { ok, status, json, transferStatus };
}
