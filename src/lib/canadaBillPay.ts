import type { LucideIcon } from "lucide-react";
import { Building2, CreditCard, Droplet, Phone, Receipt, Shield, Tv, Zap } from "lucide-react";

export type CaBillCategoryId =
  | "utility"
  | "telecom"
  | "water"
  | "insurance"
  | "tax"
  | "credit"
  | "other";

export interface CaBillCategory {
  id: CaBillCategoryId;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const CA_BILL_CATEGORIES: CaBillCategory[] = [
  { id: "utility", label: "Electricity / Utility", description: "Hydro, gas, power companies", icon: Zap },
  { id: "telecom", label: "Phone / Internet / TV", description: "Rogers, Bell, Telus, etc.", icon: Phone },
  { id: "water", label: "Water / Municipal", description: "City water, municipal services", icon: Droplet },
  { id: "insurance", label: "Insurance", description: "Home, auto, life premiums", icon: Shield },
  { id: "tax", label: "Tax / Government", description: "CRA, property tax, fines", icon: Building2 },
  { id: "credit", label: "Credit card / Loan", description: "Card or loan payments", icon: CreditCard },
  { id: "other", label: "Other biller", description: "Any payee with EFT or Interac details", icon: Receipt },
];

export const CA_BILL_CATEGORY_LABEL: Record<CaBillCategoryId, string> = Object.fromEntries(
  CA_BILL_CATEGORIES.map((c) => [c.id, c.label]),
) as Record<CaBillCategoryId, string>;

export type CaBillPayMethod = "eft" | "interac";

/** Canadian financial institution numbers (mirrors supabase/functions/_shared/caInstitutions.ts). */
export const CA_INSTITUTIONS: Record<string, string> = {
  "001": "Bank of Montreal",
  "002": "Scotiabank",
  "003": "Royal Bank of Canada",
  "004": "TD Canada Trust",
  "006": "National Bank of Canada",
  "010": "CIBC",
  "016": "HSBC Bank Canada",
  "030": "Canadian Western Bank",
  "039": "Laurentian Bank",
  "219": "ATB Financial",
  "320": "PC Financial",
  "540": "Manulife Bank",
  "614": "Tangerine",
  "623": "Equitable Bank (EQ Bank)",
  "703": "Wealthsimple",
  "809": "Central 1 Credit Union (BC)",
  "815": "Desjardins",
  "828": "Central 1 Credit Union (ON)",
  "837": "Meridian Credit Union",
  "865": "Servus Credit Union",
  "879": "Credit Union (MB)",
  "889": "SaskCentral Credit Union",
  "899": "Alberta Credit Union",
};

export function caInstitutionName(code: string): string | null {
  if (!/^\d{3}$/.test(code)) return null;
  return CA_INSTITUTIONS[code] ?? null;
}

export interface CaRecentPayee {
  key: string;
  payeeName: string;
  category: CaBillCategoryId;
  accountReference: string;
  method: CaBillPayMethod;
  institution?: string;
  transit?: string;
  accountNumber?: string;
  email?: string;
}

/** Rebuilds saved payees from past bill_payments + their linked transfers (newest first, deduped). */
export function buildRecentPayees(
  bills: { biller_name: string | null; category: string; customer_identifier: string; flw_reference: string | null }[],
  transfers: { id: string; recipient_account: string | null; payout_method: string | null }[],
): CaRecentPayee[] {
  const byId = new Map(transfers.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const out: CaRecentPayee[] = [];
  for (const b of bills) {
    const t = b.flw_reference ? byId.get(b.flw_reference) : undefined;
    if (!t?.recipient_account || !b.biller_name) continue;
    const method: CaBillPayMethod = String(t.payout_method || "").includes("interac") ? "interac" : "eft";
    const key = `${b.biller_name}|${b.customer_identifier}|${t.recipient_account}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const cat = b.category.replace(/^ca_/, "") as CaBillCategoryId;
    const payee: CaRecentPayee = {
      key,
      payeeName: b.biller_name,
      category: CA_BILL_CATEGORY_LABEL[cat] ? cat : "other",
      accountReference: b.customer_identifier,
      method,
    };
    if (method === "interac") {
      payee.email = t.recipient_account;
    } else {
      const [inst, transit, ...acct] = t.recipient_account.split("-");
      payee.institution = inst;
      payee.transit = transit;
      payee.accountNumber = acct.join("");
    }
    out.push(payee);
    if (out.length >= 6) break;
  }
  return out;
}

/** Common Canadian billers — suggestions only; the user supplies the biller's EFT or Interac details. */
export const CA_BILL_PAYEE_HINTS = [
  "Hydro One",
  "BC Hydro",
  "Enbridge",
  "Rogers",
  "Bell",
  "Telus",
  "Shaw",
  "CRA / Revenue Canada",
  "City of Toronto",
  "Insurance provider",
];
