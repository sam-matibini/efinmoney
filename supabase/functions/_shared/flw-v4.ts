/**
 * Flutterwave V4 (OAuth) shared helper.
 * Live base: https://f4bexperience.flutterwave.com
 * Auth: Client ID + Client Secret → short-lived Bearer token
 *
 * Env:
 *   FLW_CLIENT_ID
 *   FLW_CLIENT_SECRET
 *   FLW_ENCRYPTION_KEY (optional — direct card)
 *   FLW_V4_BASE_URL (optional override)
 *   FLW_V4_ENV = live | sandbox (default live)
 */

const TOKEN_URL =
  "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";

const LIVE_BASE = "https://f4bexperience.flutterwave.com";
const SANDBOX_BASE = "https://developersandbox-api.flutterwave.com";

type TokenCache = { accessToken: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export function isFlwV4Configured(): boolean {
  return Boolean(
    Deno.env.get("FLW_CLIENT_ID")?.trim() && Deno.env.get("FLW_CLIENT_SECRET")?.trim(),
  );
}

export function getFlwV4BaseUrl(): string {
  // Optional static-egress reverse proxy for IP-whitelisted payouts.
  // Do NOT fall back to FLW_PROXY_URL — that is the V3 worker and rejects /direct-transfers.
  const proxy = Deno.env.get("FLW_V4_PROXY_URL")?.trim();
  if (proxy) return proxy.replace(/\/+$/, "");
  const override = Deno.env.get("FLW_V4_BASE_URL")?.trim();
  if (override) return override.replace(/\/+$/, "");
  const env = (Deno.env.get("FLW_V4_ENV") || "live").toLowerCase();
  return env === "sandbox" || env === "test" ? SANDBOX_BASE : LIVE_BASE;
}

export async function getFlwV4AccessToken(): Promise<string> {
  const clientId = Deno.env.get("FLW_CLIENT_ID")?.trim() || "";
  const clientSecret = Deno.env.get("FLW_CLIENT_SECRET")?.trim() || "";
  if (!clientId || !clientSecret) {
    throw new Error("FLW_CLIENT_ID / FLW_CLIENT_SECRET not configured");
  }

  // Refresh ~60s before expiry
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    const msg = json.error_description || json.error || json.message || `OAuth HTTP ${res.status}`;
    throw new Error(`Flutterwave OAuth failed: ${msg}`);
  }

  tokenCache = {
    accessToken: String(json.access_token),
    expiresAt: Date.now() + Number(json.expires_in || 600) * 1000,
  };
  return tokenCache.accessToken;
}

export type FlwV4Result = { ok: boolean; status: number; json: Record<string, unknown> };

export async function flwV4Fetch(
  path: string,
  init: RequestInit & { json?: Record<string, unknown>; timeoutMs?: number } = {},
): Promise<FlwV4Result> {
  const base = getFlwV4BaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  const token = await getFlwV4AccessToken();

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (!headers.has("X-Trace-Id")) headers.set("X-Trace-Id", crypto.randomUUID());
  if (!headers.has("X-Idempotency-Key") && (init.method || "GET").toUpperCase() !== "GET") {
    headers.set("X-Idempotency-Key", crypto.randomUUID());
  }

  let body = init.body;
  if (init.json) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(1000, Number(init.timeoutMs) || 25_000));
  try {
    const res = await fetch(url, { ...init, headers, body, signal: ctrl.signal });
    clearTimeout(t);
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    const ok = res.ok && (json.status === "success" || json.status === "successful" || res.status === 201);
    if (!ok && !json.message && !(json.error as { message?: string } | undefined)?.message) {
      json.message = text?.slice(0, 500) || `HTTP ${res.status}`;
    }
    return { ok, status: res.status, json };
  } catch (err) {
    clearTimeout(t);
    return {
      ok: false,
      status: 0,
      json: { message: err instanceof Error ? err.message : "network error" },
    };
  }
}

export function flwV4ErrorMessage(json: Record<string, unknown>, fallback = "Flutterwave error"): string {
  const err = json.error as {
    message?: string;
    type?: string;
    validation_errors?: Array<{ field_name?: string; message?: string } | string>;
  } | undefined;
  const parts: string[] = [];
  if (err?.message) parts.push(String(err.message));
  if (Array.isArray(err?.validation_errors)) {
    for (const v of err.validation_errors) {
      if (typeof v === "string" && v.trim()) parts.push(v.trim());
      else if (v && typeof v === "object") {
        const field = v.field_name ? `${v.field_name}: ` : "";
        if (v.message) parts.push(`${field}${v.message}`);
      }
    }
  }
  if (parts.length) return parts.join(" — ");
  if (typeof json.message === "string" && json.message) return json.message;
  return fallback;
}

/** Dial / network helpers for MoMo corridors enabled on this merchant. */
export function flwV4DialCode(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "KES") return "254";
  if (c === "UGX") return "256";
  if (c === "TZS") return "255";
  if (c === "RWF") return "250";
  if (c === "GHS") return "233";
  if (c === "ZMW") return "260";
  if (c === "NGN") return "234";
  return "";
}

const KNOWN_DIALS = ["254", "256", "255", "250", "233", "260", "234"];

/**
 * Split E.164 / local phone into country_code + national number for V4.
 * Rejects phones that clearly belong to a different country than the wallet currency.
 */
export function flwV4SplitPhone(
  phone: string,
  currency: string,
): { ok: true; country_code: string; phone_number: string } | { ok: false; error: string } {
  const dial = flwV4DialCode(currency);
  if (!dial) return { ok: false, error: `Unsupported currency for mobile money: ${currency}` };

  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return { ok: false, error: "Enter a valid mobile money phone number" };

  // Detect wrong country prefix (e.g. 256… on a KES wallet).
  for (const other of KNOWN_DIALS) {
    if (other !== dial && digits.startsWith(other)) {
      return {
        ok: false,
        error: `That number looks like +${other}, but ${currency} requires +${dial}`,
      };
    }
  }

  if (digits.startsWith(dial)) digits = digits.slice(dial.length);
  if (digits.startsWith("0")) digits = digits.slice(1);

  // V4 expects unformatted 7–10 digit national number.
  if (digits.length < 7 || digits.length > 10) {
    return {
      ok: false,
      error: `Enter a ${currency} number (e.g. ${dial}7… or 07…)`,
    };
  }

  return { ok: true, country_code: dial, phone_number: digits };
}

export function flwV4NormalizeNetwork(network: string, currency: string): string {
  const n = network.trim().toUpperCase().replace(/[\s_-]+/g, "");
  const c = currency.toUpperCase();
  if (c === "KES" || n.includes("MPESA") || n === "SAFARICOM" || n === "MPS") return "MPESA";
  if (n.includes("MTN")) return "MTN";
  if (n.includes("AIRTEL") || n.includes("ATL")) return "AIRTEL";
  if (n.includes("VODA") || n.includes("TIGO") || n.includes("YAS") || n.includes("HALO")) return "VODAFONE";
  if (c === "UGX" || c === "GHS" || c === "RWF" || c === "ZMW") return "MTN";
  if (c === "TZS") return "VODAFONE";
  return network.toUpperCase() || "MTN";
}

export async function flwV4SearchCustomerByEmail(
  email: string,
): Promise<FlwV4Result & { customerId: string | null }> {
  const result = await flwV4Fetch("/customers/search", {
    method: "POST",
    json: { email },
  });
  const rows = Array.isArray(result.json.data) ? result.json.data as Array<{ id?: string }> : [];
  const id = rows[0]?.id ? String(rows[0].id) : null;
  return { ...result, customerId: id };
}

export async function flwV4CreateCustomer(params: {
  email: string;
  firstName?: string;
  lastName?: string;
  countryCode?: string;
  phoneNumber?: string;
}): Promise<FlwV4Result & { customerId: string | null }> {
  // Reuse existing customer if Flutterwave already has this email (common on retries).
  const existing = await flwV4SearchCustomerByEmail(params.email);
  if (existing.customerId) {
    return { ok: true, status: 200, json: existing.json, customerId: existing.customerId };
  }

  const body: Record<string, unknown> = {
    email: params.email,
    name: {
      first: params.firstName || "eFin",
      last: params.lastName || "User",
    },
  };
  if (params.countryCode && params.phoneNumber) {
    body.phone = { country_code: params.countryCode, number: params.phoneNumber };
  }
  const result = await flwV4Fetch("/customers", { method: "POST", json: body });
  if (result.ok) {
    const data = result.json.data as { id?: string } | undefined;
    return { ...result, customerId: data?.id ? String(data.id) : null };
  }

  // Race / duplicate: create failed with "already exists" — search again.
  const msg = flwV4ErrorMessage(result.json, "").toLowerCase();
  if (result.status === 409 || msg.includes("already exists") || msg.includes("duplicate")) {
    const again = await flwV4SearchCustomerByEmail(params.email);
    if (again.customerId) {
      return { ok: true, status: 200, json: again.json, customerId: again.customerId };
    }
  }

  return { ...result, customerId: null };
}

export async function flwV4CreateMobileMoneyMethod(params: {
  countryCode: string;
  network: string;
  phoneNumber: string;
}): Promise<FlwV4Result & { paymentMethodId: string | null }> {
  const result = await flwV4Fetch("/payment-methods", {
    method: "POST",
    json: {
      type: "mobile_money",
      mobile_money: {
        country_code: params.countryCode,
        network: params.network,
        phone_number: params.phoneNumber,
      },
    },
  });
  const data = result.json.data as { id?: string } | undefined;
  return { ...result, paymentMethodId: data?.id ? String(data.id) : null };
}

export async function flwV4CreateCharge(params: {
  amount: number;
  currency: string;
  reference: string;
  customerId: string;
  paymentMethodId: string;
  redirectUrl?: string;
  meta?: Record<string, unknown>;
}): Promise<FlwV4Result & { chargeId: string | null; nextAction: Record<string, unknown> | null }> {
  const body: Record<string, unknown> = {
    amount: params.amount,
    currency: params.currency.toUpperCase(),
    reference: params.reference,
    customer_id: params.customerId,
    payment_method_id: params.paymentMethodId,
    meta: params.meta || {},
  };
  if (params.redirectUrl) body.redirect_url = params.redirectUrl;

  const result = await flwV4Fetch("/charges", { method: "POST", json: body, timeoutMs: 30_000 });
  const data = (result.json.data || {}) as Record<string, unknown>;
  return {
    ...result,
    chargeId: data.id ? String(data.id) : null,
    nextAction: (data.next_action as Record<string, unknown>) || null,
  };
}

/** Map internal network labels → Flutterwave V4 MoMo network codes. */
export function flwV4PayoutNetwork(network: string, currency: string): string {
  const n = network.trim().toUpperCase().replace(/[\s_-]+/g, "");
  const c = currency.toUpperCase();
  if (c === "KES" || n === "MPS" || n.includes("MPESA") || n.includes("SAFARICOM")) return "MPS";
  if (n.includes("AIRTELTIGO")) return "AIRTELTIGO";
  if (n.includes("VODA") || n === "VOD" || n.includes("TELECEL") || n.includes("VODACOM")) return "VODAFONE";
  if (n.includes("TIGO")) return "TIGO";
  if (n.includes("ZAMTEL")) return "ZAMTEL";
  if (n.includes("AIRTEL") || n === "ATL" || n === "AIR") return "AIRTEL";
  if (n.includes("MTN")) return "MTN";
  if (c === "KES") return "MPS";
  if (c === "TZS") return "AIRTEL";
  return "MTN";
}

export function flwV4Iso2ForCurrency(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "KES") return "KE";
  if (c === "UGX") return "UG";
  if (c === "GHS") return "GH";
  if (c === "RWF") return "RW";
  if (c === "TZS") return "TZ";
  if (c === "ZMW") return "ZM";
  if (c === "NGN") return "NG";
  return "";
}

/** Full MSISDN with country dial code, digits only. */
export function flwV4PayoutMsisdn(phone: string, currency: string): string {
  const dial = flwV4DialCode(currency);
  let digits = String(phone).replace(/\D/g, "");
  if (dial && digits.startsWith(dial)) return digits;
  if (digits.startsWith("0")) digits = digits.slice(1);
  return `${dial}${digits}`;
}

export async function flwV4CreateDirectTransfer(params: {
  type: "mobile_money" | "bank";
  amount: number;
  currency: string;
  reference: string;
  narration: string;
  callbackUrl?: string;
  meta?: Record<string, unknown>;
  // MoMo
  network?: string;
  phone?: string;
  recipientFirstName?: string;
  recipientLastName?: string;
  // Bank
  bankCode?: string;
  accountNumber?: string;
}): Promise<FlwV4Result & { transferId: string | null }> {
  const currency = params.currency.toUpperCase();
  const name = {
    first: (params.recipientFirstName || "eFin").slice(0, 50),
    last: (params.recipientLastName || "User").slice(0, 50),
  };

  let payment_instruction: Record<string, unknown>;
  if (params.type === "bank") {
    payment_instruction = {
      source_currency: currency,
      destination_currency: currency,
      amount: { applies_to: "destination_currency", value: params.amount },
      recipient: {
        name,
        bank: {
          account_number: String(params.accountNumber || "").replace(/\D/g, ""),
          code: String(params.bankCode || ""),
        },
      },
    };
  } else {
    const network = flwV4PayoutNetwork(params.network || "", currency);
    const msisdn = flwV4PayoutMsisdn(params.phone || "", currency);
    const country = flwV4Iso2ForCurrency(currency);
    payment_instruction = {
      source_currency: currency,
      destination_currency: currency,
      amount: { applies_to: "destination_currency", value: params.amount },
      recipient: {
        name,
        mobile_money: {
          network,
          msisdn,
          ...(country ? { country } : {}),
        },
      },
    };
  }

  const body: Record<string, unknown> = {
    action: "instant",
    type: params.type,
    reference: params.reference,
    narration: params.narration.slice(0, 180),
    payment_instruction,
    meta: params.meta || {},
  };
  if (params.callbackUrl) body.callback_url = params.callbackUrl;

  const result = await flwV4Fetch("/direct-transfers", {
    method: "POST",
    json: body,
    timeoutMs: 30_000,
  });
  const data = (result.json.data || {}) as { id?: string };
  return { ...result, transferId: data.id ? String(data.id) : null };
}

export async function flwV4CreateCardMethod(params: {
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
}): Promise<FlwV4Result & { paymentMethodId: string | null }> {
  const { flwV4EncryptCardFields, getFlwV4EncryptionKey, flwV4GenerateNonce } = await import("./flw-encrypt.ts");
  const encKey = getFlwV4EncryptionKey();
  if (!encKey) {
    return {
      ok: false,
      status: 0,
      json: {
        message:
          "V4 encryption key missing. Set FLW_ENCRYPTION_KEY to the base64 Encryption key from company Flutterwave → Settings → API.",
      },
      paymentMethodId: null,
    };
  }

  const nonce = flwV4GenerateNonce(12);
  const year = params.expiryYear.length === 4 ? params.expiryYear.slice(-2) : params.expiryYear;
  let encrypted: Awaited<ReturnType<typeof flwV4EncryptCardFields>>;
  try {
    encrypted = await flwV4EncryptCardFields(
      {
        card_number: params.cardNumber.replace(/\s/g, ""),
        expiry_month: params.expiryMonth.padStart(2, "0"),
        expiry_year: year,
        cvv: params.cvv,
      },
      encKey,
      nonce,
    );
  } catch (e) {
    return {
      ok: false,
      status: 0,
      json: { message: e instanceof Error ? e.message : "Card encryption failed" },
      paymentMethodId: null,
    };
  }

  const result = await flwV4Fetch("/payment-methods", {
    method: "POST",
    json: {
      type: "card",
      card: {
        nonce: encrypted.nonce,
        encrypted_card_number: encrypted.encrypted_card_number,
        encrypted_expiry_month: encrypted.encrypted_expiry_month,
        encrypted_expiry_year: encrypted.encrypted_expiry_year,
        encrypted_cvv: encrypted.encrypted_cvv,
      },
    },
    timeoutMs: 30_000,
  });
  const data = result.json.data as { id?: string } | undefined;
  return { ...result, paymentMethodId: data?.id ? String(data.id) : null };
}

export async function flwV4UpdateChargeAuthorization(params: {
  chargeId: string;
  authorizationType: string;
  pin?: string;
  otp?: string;
  avs?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    zipcode?: string;
  };
}): Promise<FlwV4Result> {
  const body: Record<string, unknown> = { authorization: {} };
  if (params.pin) {
    const { flwV4EncryptField, getFlwV4EncryptionKey, flwV4GenerateNonce } = await import("./flw-encrypt.ts");
    const encKey = getFlwV4EncryptionKey();
    if (!encKey) {
      return { ok: false, status: 0, json: { message: "FLW_ENCRYPTION_KEY missing for PIN encryption" } };
    }
    const nonce = flwV4GenerateNonce(12);
    const encrypted_pin = await flwV4EncryptField(params.pin, encKey, nonce);
    body.authorization = { type: params.authorizationType, pin: { nonce, encrypted_pin } };
  } else if (params.otp) {
    body.authorization = { type: params.authorizationType, otp: params.otp };
  } else if (params.avs) {
    const avs: Record<string, string> = {};
    for (const [k, v] of Object.entries(params.avs)) {
      if (v && String(v).trim()) avs[k] = String(v).trim();
    }
    if (Object.keys(avs).length === 0) {
      return { ok: false, status: 0, json: { message: "billing address required" } };
    }
    body.authorization = { type: params.authorizationType, avs };
  } else {
    return { ok: false, status: 0, json: { message: "pin, otp or avs required" } };
  }

  return flwV4Fetch(`/charges/${encodeURIComponent(params.chargeId)}`, {
    method: "PUT",
    json: body,
    timeoutMs: 30_000,
  });
}

export async function flwV4GetCharge(chargeId: string): Promise<FlwV4Result> {
  return flwV4Fetch(`/charges/${encodeURIComponent(chargeId)}`, {
    method: "GET",
    timeoutMs: 20_000,
  });
}
