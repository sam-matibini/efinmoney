/** CRA payment types, identifier + period validation (mirrored in src/lib/craPayment.ts and mobile lib/craPayment.ts). */

export type CraTaxpayerType = "individual" | "business";
export type CraPeriodKind = "year" | "month" | "date";

export interface CraPaymentType {
  id: string;
  taxpayer: CraTaxpayerType;
  label: string;
  /** Bank bill-pay payee ops must select (names vary slightly by bank). */
  payee: string;
  /** Required program account prefix for business payments. */
  program?: "RC" | "RP" | "RT";
  period: CraPeriodKind;
}

export const CRA_PAYMENT_TYPES: CraPaymentType[] = [
  { id: "t1_balance", taxpayer: "individual", label: "Personal income tax — balance owing", payee: "CRA (Revenue) – Tax Amount Owing", period: "year" },
  { id: "t1_instalment", taxpayer: "individual", label: "Personal income tax — instalment", payee: "CRA (Revenue) – Tax Instalment", period: "year" },
  { id: "rc_balance", taxpayer: "business", label: "Corporation income tax — balance owing", payee: "CRA (Revenue) – Corporation Tax Amount Owing", program: "RC", period: "date" },
  { id: "rc_instalment", taxpayer: "business", label: "Corporation income tax — instalment", payee: "CRA (Revenue) – Corporation Tax Instalment", program: "RC", period: "date" },
  { id: "rp_remittance", taxpayer: "business", label: "Payroll source deductions", payee: "CRA (Revenue) – Payroll Source Deductions", program: "RP", period: "month" },
  { id: "rt_return", taxpayer: "business", label: "GST/HST — return payment", payee: "CRA (Revenue) – GST/HST Payment", program: "RT", period: "date" },
  { id: "rt_instalment", taxpayer: "business", label: "GST/HST — instalment", payee: "CRA (Revenue) – GST/HST Instalment", program: "RT", period: "date" },
];

export const CRA_MIN_AMOUNT = 1;
export const CRA_MAX_AMOUNT = 50_000;
export const CRA_KYC_THRESHOLD = 1_000;

export function craPaymentType(id: string): CraPaymentType | undefined {
  return CRA_PAYMENT_TYPES.find((t) => t.id === id);
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function normalizeDigits(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

/** SIN: 9 digits, Luhn check digit, cannot start with 0 or 8. */
export function isValidSin(raw: unknown): boolean {
  const s = normalizeDigits(raw);
  return /^\d{9}$/.test(s) && s[0] !== "0" && s[0] !== "8" && luhnValid(s);
}

export function isValidBn9(raw: unknown): boolean {
  return /^\d{9}$/.test(normalizeDigits(raw));
}

export function normalizeProgramAccount(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function validatePeriod(kind: CraPeriodKind, raw: unknown, now = new Date()): string | null {
  const v = String(raw ?? "").trim();
  const year = now.getUTCFullYear();
  if (kind === "year") {
    if (!/^\d{4}$/.test(v)) return null;
    const y = Number(v);
    return y >= year - 10 && y <= year + 1 ? v : null;
  }
  if (kind === "month") {
    const m = /^(\d{4})-(\d{2})$/.exec(v);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    return y >= year - 10 && y <= year + 1 && mo >= 1 && mo <= 12 ? v : null;
  }
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!d) return null;
  const dt = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== v) return null;
  const y = Number(d[1]);
  return y >= year - 10 && y <= year + 1 ? v : null;
}

export function maskSin(sin: string | null | undefined): string {
  const s = normalizeDigits(sin);
  return s.length === 9 ? `*** *** ${s.slice(6)}` : "";
}
