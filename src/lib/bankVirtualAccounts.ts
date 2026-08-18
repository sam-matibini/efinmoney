/** Flutterwave bank-deposit virtual accounts we can actually issue today. */
export const BANK_VA_CURRENCIES = ["NGN", "GHS"] as const;

export type BankVaCurrency = (typeof BANK_VA_CURRENCIES)[number];

export function isBankVaCurrency(code: string | null | undefined): boolean {
  return BANK_VA_CURRENCIES.includes(String(code || "").toUpperCase() as BankVaCurrency);
}

export function bankVaLabel(code: string): string {
  const c = String(code || "").toUpperCase();
  if (c === "NGN") return "Nigeria (NGN)";
  if (c === "GHS") return "Ghana (GHS)";
  return c;
}
