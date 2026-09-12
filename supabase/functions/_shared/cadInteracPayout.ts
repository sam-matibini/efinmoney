/** CAD Interac e-Transfer payout destination: email and/or Canadian mobile. */

export const CAD_INTERAC_MISSING_CONTACT =
  "Add the recipient’s Interac email or Canadian mobile number. The transfer cannot complete if both are missing.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CA_MOBILE_RE = /^\+?1?[2-9]\d{9}$/;

export function parseInteracEmail(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s || s.length > 254 || !EMAIL_RE.test(s)) return null;
  return s;
}

/** Returns E.164 (+1XXXXXXXXXX) for a Canadian mobile, or null. */
export function parseCaMobile(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1") && CA_MOBILE_RE.test(digits)) {
    return `+${digits}`;
  }
  if (digits.length === 10 && CA_MOBILE_RE.test(digits)) {
    return `+1${digits}`;
  }
  const compact = String(raw ?? "").replace(/[^\d+]/g, "");
  if (CA_MOBILE_RE.test(compact)) {
    const d = compact.replace(/\D/g, "");
    return d.length === 10 ? `+1${d}` : `+${d}`;
  }
  return null;
}

/** True for CA / CAD / CAN / Canada on a transfer country column. */
export function isCanadaPayoutCountry(country?: string | null): boolean {
  const raw = String(country || "").trim().toUpperCase();
  return raw === "CA" || raw === "CAD" || raw === "CAN" || raw === "CANADA";
}

export function isCadInteracPayoutMethod(method?: string | null): boolean {
  return String(method || "").toLowerCase().includes("interac");
}

export function isCadInteracPayout(t: {
  payout_method?: string | null;
  target_currency?: string | null;
  recipient_country?: string | null;
  transfer_type?: string | null;
}): boolean {
  const method = String(t.payout_method || "").toLowerCase();
  if (!isCadInteracPayoutMethod(method)) return false;
  const ccy = String(t.target_currency || "").toUpperCase();
  const country = String(t.recipient_country || "").toUpperCase();
  const type = String(t.transfer_type || "").toLowerCase();
  return ccy === "CAD" || country === "CA" || country === "CAD" || type === "domestic_canada";
}

export type CadInteracDest = {
  email: string | null;
  phone: string | null;
  consumerId: string;
  consumerIdType: "EMAIL" | "PHONE";
};

export function resolveCadInteracDestination(input: {
  recipient_account?: unknown;
  recipient_phone?: unknown;
  recipient_email?: unknown;
  interac_email?: unknown;
}): { ok: true; dest: CadInteracDest } | { ok: false; error: string } {
  const account = String(input.recipient_account ?? "").trim();
  const email =
    parseInteracEmail(input.recipient_email)
    || parseInteracEmail(input.interac_email)
    || (account.includes("@") ? parseInteracEmail(account) : null);
  const phone =
    parseCaMobile(input.recipient_phone)
    || (!account.includes("@") ? parseCaMobile(account) : null);

  if (!email && !phone) {
    return { ok: false, error: CAD_INTERAC_MISSING_CONTACT };
  }

  if (email) {
    return {
      ok: true,
      dest: { email, phone, consumerId: email, consumerIdType: "EMAIL" },
    };
  }

  const ten = (phone || "").replace(/\D/g, "").slice(-10);
  return {
    ok: true,
    dest: { email: null, phone, consumerId: ten, consumerIdType: "PHONE" },
  };
}

/** Columns needed to gate Interac collection / payout for a Canadian recipient. */
export const CAD_INTERAC_TRANSFER_SELECT =
  "id, sender_id, payout_method, target_currency, recipient_country, transfer_type, recipient_account, recipient_phone";

/**
 * Interac e-Transfer to a Canadian recipient needs email and/or mobile.
 * Returns `required: false` when this is not a CAD Interac payout.
 */
export function requireCadInteracDestination(transfer: {
  payout_method?: string | null;
  target_currency?: string | null;
  recipient_country?: string | null;
  transfer_type?: string | null;
  recipient_account?: unknown;
  recipient_phone?: unknown;
  recipient_email?: unknown;
  interac_email?: unknown;
}):
  | { required: false }
  | { required: true; ok: true; dest: CadInteracDest }
  | { required: true; ok: false; error: string } {
  if (!isCadInteracPayout(transfer)) return { required: false };
  const resolved = resolveCadInteracDestination(transfer);
  if (!resolved.ok) return { required: true, ok: false, error: resolved.error };
  return { required: true, ok: true, dest: resolved.dest };
}
