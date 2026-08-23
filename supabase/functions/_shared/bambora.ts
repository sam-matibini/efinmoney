/**
 * Bambora / Worldline NAM (api.na.bambora.com)
 * Auth: Authorization: Passcode base64(merchant_id:passcode)
 *
 * Profile passcode (Configuration → Payment Profile) → /v1/profiles
 * Payments passcode (Configuration → Payment Gateway / Order Settings) → /v1/payments
 */
const LIVE_BASE = "https://api.na.bambora.com";

export type BamboraPasscodeKind = "profiles" | "payments" | "batch";

export interface BamboraConfig {
  merchantId: string;
  profilesPasscode: string | undefined;
  paymentsPasscode: string | undefined;
  batchPasscode: string | undefined;
  currency: string;
  baseUrl: string;
}

export function getBamboraConfig(): BamboraConfig {
  return {
    merchantId: (Deno.env.get("BAMBORA_MERCHANT_ID") || "").trim(),
    profilesPasscode: (
      Deno.env.get("BAMBORA_API_PASSCODE") ||
      Deno.env.get("BAMBORA_PROFILES_PASSCODE") ||
      ""
    ).trim() || undefined,
    paymentsPasscode: (
      Deno.env.get("BAMBORA_PAYMENTS_PASSCODE") ||
      Deno.env.get("BAMBORA_PAYMENT_PASSCODE") ||
      ""
    ).trim() || undefined,
    batchPasscode: (
      Deno.env.get("BAMBORA_BATCH_PASSCODE") ||
      Deno.env.get("BAMBORA_BATCH_UPLOAD_PASSCODE") ||
      ""
    ).trim() || undefined,
    currency: (Deno.env.get("BAMBORA_CURRENCY") || "CAD").trim().toUpperCase(),
    baseUrl: (Deno.env.get("BAMBORA_BASE_URL") || LIVE_BASE).replace(/\/+$/, ""),
  };
}

/** @deprecated alias — prefer paymentsPasscode */
export function bamboraPaymentsReady(): boolean {
  const c = getBamboraConfig();
  return Boolean(c.merchantId && c.paymentsPasscode);
}

function passcodeAuth(merchantId: string, passcode: string): string {
  const token = btoa(`${merchantId}:${passcode}`);
  return `Passcode ${token}`;
}

export async function bamboraFetch(
  path: string,
  opts: {
    method?: string;
    body?: string;
    kind?: BamboraPasscodeKind;
    timeoutMs?: number;
  } = {},
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; raw: string }> {
  const cfg = getBamboraConfig();
  if (!cfg.merchantId) throw new Error("BAMBORA_MERCHANT_ID not configured");

  const kind = opts.kind || "profiles";
  const passcode = kind === "payments"
    ? cfg.paymentsPasscode
    : kind === "batch"
      ? cfg.batchPasscode
      : cfg.profilesPasscode;
  if (!passcode) {
    throw new Error(
      kind === "payments"
        ? "BAMBORA_PAYMENTS_PASSCODE not configured (Order Settings / Payment Gateway API passcode)"
        : kind === "batch"
          ? "BAMBORA_BATCH_PASSCODE not configured (Batch Upload API passcode)"
          : "BAMBORA_API_PASSCODE not configured (Payment Profile API passcode)",
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: passcodeAuth(cfg.merchantId, passcode),
  };
  if (opts.body) headers["Content-Type"] = "application/json";

  const url = path.startsWith("http") ? path : `${cfg.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25_000);
  try {
    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body,
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      json = { raw: raw.slice(0, 800) };
    }
    return { ok: res.ok, status: res.status, json, raw: raw.slice(0, 2000) };
  } finally {
    clearTimeout(t);
  }
}

/** Auth probe: unknown profile id → 404 means credentials work; 401/403 means bad passcode. */
export async function bamboraProbeProfilesAuth(): Promise<{
  configured: boolean;
  auth_ok: boolean;
  http_status: number;
  message: string;
  merchant_id: string;
  currency: string;
}> {
  const cfg = getBamboraConfig();
  if (!cfg.merchantId || !cfg.profilesPasscode) {
    return {
      configured: false,
      auth_ok: false,
      http_status: 0,
      message: "Missing BAMBORA_MERCHANT_ID or BAMBORA_API_PASSCODE",
      merchant_id: cfg.merchantId || "",
      currency: cfg.currency,
    };
  }

  const res = await bamboraFetch("/v1/profiles/efin-auth-probe", { method: "GET", kind: "profiles" });
  const code = String(res.json?.code || res.json?.category || "");
  const msg = String(res.json?.message || res.json?.raw || `HTTP ${res.status}`);
  // 404 / 402 / business "not found" ⇒ auth accepted
  const authOk = res.status === 404 || res.status === 402 ||
    (res.status !== 401 && res.status !== 403 && !/auth|unauthorized|forbidden|passcode/i.test(msg + code));

  return {
    configured: true,
    auth_ok: authOk || res.ok,
    http_status: res.status,
    message: msg,
    merchant_id: cfg.merchantId,
    currency: cfg.currency,
  };
}

export function isBamboraPaymentApproved(json: Record<string, unknown>): boolean {
  return String(json.approved ?? "") === "1"
    || String(json.message || "").toLowerCase() === "approved";
}

export function bamboraTxnId(json: Record<string, unknown>): string {
  return String(json.id || json.transaction_id || "");
}

export async function bamboraGetProfile(customerCode: string) {
  return bamboraFetch(`/v1/profiles/${encodeURIComponent(customerCode)}`, { kind: "profiles" });
}

export async function bamboraCreateProfileFromToken(input: {
  customerCode: string;
  token: string;
  name: string;
  email?: string;
  validate?: boolean;
}) {
  const body = {
    customer_code: input.customerCode,
    language: "eng",
    validate: input.validate ?? true,
    token: { name: input.name.slice(0, 64), code: input.token },
    billing: input.email ? { email_address: input.email.slice(0, 128) } : undefined,
  };
  return bamboraFetch("/v1/profiles", {
    method: "POST",
    body: JSON.stringify(body),
    kind: "profiles",
  });
}

export async function bamboraCreateProfileFromTransaction(customerCode: string, transactionId: string | number) {
  return bamboraFetch("/v1/profiles", {
    method: "POST",
    body: JSON.stringify({
      customer_code: customerCode,
      language: "eng",
      create_from_id: Number(transactionId),
    }),
    kind: "profiles",
  });
}

export async function bamboraAddCardToProfile(customerCode: string, token: string, name: string) {
  return bamboraFetch(`/v1/profiles/${encodeURIComponent(customerCode)}/cards`, {
    method: "POST",
    body: JSON.stringify({ token: { name: name.slice(0, 64), code: token } }),
    kind: "profiles",
  });
}

export async function bamboraDeleteProfile(customerCode: string) {
  return bamboraFetch(`/v1/profiles/${encodeURIComponent(customerCode)}`, {
    method: "DELETE",
    kind: "profiles",
  });
}

export async function bamboraDeleteProfileCard(customerCode: string, cardId: number) {
  return bamboraFetch(`/v1/profiles/${encodeURIComponent(customerCode)}/cards/${cardId}`, {
    method: "DELETE",
    kind: "profiles",
  });
}

export async function bamboraSaveBankToProfile(customerCode: string, bank: {
  holder: string;
  accountNumber: string;
  institutionNumber: string;
  branchNumber: string;
  accountType?: string;
}) {
  return bamboraFetch(`/v1/profiles/${encodeURIComponent(customerCode)}`, {
    method: "PUT",
    body: JSON.stringify({
      language: "eng",
      bank_account: {
        bank_account_holder: bank.holder.slice(0, 64),
        account_number: bank.accountNumber.replace(/\D/g, ""),
        bank_account_type: bank.accountType || "Canadian",
        institution_number: bank.institutionNumber.replace(/\D/g, "").padStart(3, "0").slice(-3),
        branch_number: bank.branchNumber.replace(/\D/g, "").padStart(5, "0").slice(-5),
      },
    }),
    kind: "profiles",
  });
}

export async function bamboraChargeToken(input: {
  token: string;
  name: string;
  amount: number;
  currency: string;
  orderNumber: string;
  complete?: boolean;
}) {
  const amountStr = input.amount.toFixed(2);
  return bamboraFetch("/v1/payments", {
    method: "POST",
    body: JSON.stringify({
      amount: Number(amountStr),
      currency: input.currency.toUpperCase(),
      payment_method: "token",
      order_number: input.orderNumber,
      token: {
        name: input.name.slice(0, 64),
        code: input.token,
        complete: input.complete ?? true,
      },
    }),
    kind: "payments",
    timeoutMs: 45_000,
  });
}

export async function bamboraChargeProfile(input: {
  customerCode: string;
  cardId: number;
  amount: number;
  currency: string;
  orderNumber: string;
  complete?: boolean;
}) {
  const amountStr = input.amount.toFixed(2);
  return bamboraFetch("/v1/payments", {
    method: "POST",
    body: JSON.stringify({
      amount: Number(amountStr),
      currency: input.currency.toUpperCase(),
      payment_method: "payment_profile",
      order_number: input.orderNumber,
      payment_profile: {
        customer_code: input.customerCode,
        card_id: input.cardId,
        complete: input.complete ?? true,
      },
    }),
    kind: "payments",
    timeoutMs: 45_000,
  });
}

/** EFT debit collect via batch file using a Payment Profile customer_code. */
export async function bamboraSubmitEftDebitBatch(input: {
  customerCode: string;
  amount: number;
  descriptor?: string;
  processNow?: boolean;
}) {
  const cfg = getBamboraConfig();
  if (!cfg.merchantId || !cfg.batchPasscode) {
    throw new Error("BAMBORA_BATCH_PASSCODE not configured");
  }
  const pennies = Math.round(input.amount * 100);
  const descriptor = (input.descriptor || "eFinMoney wallet top-up").slice(0, 32);
  // EFT row: type E, operation D (debit), profile-based row per Worldline batch spec
  const csv = `E,D,,,,${pennies},,,${input.customerCode},${descriptor}\n`;
  const form = new FormData();
  form.append("criteria", JSON.stringify({ process_now: input.processNow === false ? 0 : 1 }));
  form.append("file", new Blob([csv], { type: "text/plain" }), "eft-debit.csv");

  const url = `${cfg.baseUrl}/v1/batchpayments`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: passcodeAuth(cfg.merchantId, cfg.batchPasscode!),
        FileType: "STD",
      },
      body: form,
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    } catch {
      json = { raw: raw.slice(0, 800) };
    }
    return { ok: res.ok, status: res.status, json, raw: raw.slice(0, 2000) };
  } finally {
    clearTimeout(t);
  }
}

export async function bamboraRefundPayment(transactionId: string, amount?: number) {
  const body = amount != null ? JSON.stringify({ amount: Number(amount.toFixed(2)) }) : undefined;
  return bamboraFetch(`/v1/payments/${encodeURIComponent(transactionId)}/returns`, {
    method: "POST",
    body,
    kind: "payments",
    timeoutMs: 45_000,
  });
}

export function extractProfileCards(json: Record<string, unknown>): Array<Record<string, unknown>> {
  const cards = json.card as unknown;
  if (Array.isArray(cards)) return cards as Array<Record<string, unknown>>;
  if (cards && typeof cards === "object") return [cards as Record<string, unknown>];
  return [];
}
