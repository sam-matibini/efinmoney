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
  /** Optional outlet/sub-account ID to credit (NOT the parent accountId header). */
  subAccountId?: string;
  meta?: Record<string, string>;
}): Promise<{ ok: true; checkoutLink: string; orderReference: string } | { ok: false; error: string }> {
  const amountStr = params.amount.toFixed(2);
  // Parent accountId belongs in the header only (via nombaApiFetch).
  // Body accountId is ONLY for outlet/sub-accounts — putting the parent UUID here
  // makes Nomba look up a settlement account number and fail with
  // "Invalid input: No Account Number found".
  const subAccountId = (params.subAccountId || Deno.env.get("NOMBA_SUBACCOUNT_ID") || "").trim();
  const order: Record<string, unknown> = {
    amount: amountStr,
    currency: params.currency.toUpperCase(),
    callbackUrl: params.callbackUrl,
    customerEmail: params.customerEmail,
    orderReference: params.orderReference,
    orderMetaData: params.meta,
  };
  if (subAccountId) order.accountId = subAccountId;

  const { ok, status, json } = await nombaApiFetch("/v1/checkout/order", {
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
  const { ok, status, json } = await nombaApiFetch(
    `/v1/checkout/transaction?idType=${encodeURIComponent(idType)}&id=${encodeURIComponent(params.id)}`,
    { method: "GET" },
  );
  const data = (json?.data ?? {}) as Record<string, unknown>;
  const details = (data.transactionDetails && typeof data.transactionDetails === "object")
    ? data.transactionDetails as Record<string, unknown>
    : {};
  const statusCode = String(details.statusCode ?? data.status ?? data.message ?? "").toLowerCase();
  const successFlag = String(data.success ?? "").toLowerCase();
  const paid = successFlag === "true"
    || successFlag === "1"
    || statusCode === "00"
    || statusCode.includes("approved")
    || statusCode.includes("success")
    || statusCode.includes("paid")
    || String(json?.description || "").toLowerCase().includes("success");
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
  const prettyOk = /SUCCESS|COMPLETE|PROCESS|PENDING/i.test(transferStatus)
    || String(data.prettyStatus || "").toLowerCase().includes("success")
    || String(data.coreStatus || "").toUpperCase().includes("SUCCESS");
  return {
    ok: ok || prettyOk,
    status,
    json,
    transactionId,
    transferStatus: transferStatus || (ok ? "PROCESSING" : "FAILED"),
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
