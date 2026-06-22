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
  { id: "other", label: "Other biller", description: "Any payee with EFT details", icon: Receipt },
];

export const CA_BILL_CATEGORY_LABEL: Record<CaBillCategoryId, string> = Object.fromEntries(
  CA_BILL_CATEGORIES.map((c) => [c.id, c.label]),
) as Record<CaBillCategoryId, string>;

/** Common Canadian billers — user still enters bank details manually (short-term MVP). */
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
