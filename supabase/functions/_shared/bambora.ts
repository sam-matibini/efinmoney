/**
 * Bambora / Worldline NAM (api.na.bambora.com)
 * Auth: Authorization: Passcode base64(merchant_id:passcode)
 *
 * Profile passcode (Configuration → Payment Profile) → /v1/profiles
 * Payments passcode (Configuration → Payment Gateway / Order Settings) → /v1/payments
 */
const LIVE_BASE = "https://api.na.bambora.com";

export type BamboraPasscodeKind = "profiles" | "payments";

export interface BamboraConfig {
  merchantId: string;
  profilesPasscode: string | undefined;
  paymentsPasscode: string | undefined;
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
  const passcode = kind === "payments" ? cfg.paymentsPasscode : cfg.profilesPasscode;
  if (!passcode) {
    throw new Error(
      kind === "payments"
        ? "BAMBORA_PAYMENTS_PASSCODE not configured (Order Settings / Payment Gateway API passcode)"
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
