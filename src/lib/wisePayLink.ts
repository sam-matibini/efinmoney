/**
 * Hosted Wise business pay page — used as a pay-in checkout option.
 * Override the URL with VITE_WISE_PAY_LINK.
 */
const DEFAULT_WISE_PAY_LINK = "https://wise.com/pay/business/efintaxadvisorsltd1";

export const WISE_PAY_LINK: string =
  (import.meta.env.VITE_WISE_PAY_LINK as string | undefined)?.trim() || DEFAULT_WISE_PAY_LINK;

export const WISE_PAY_CURRENCIES = ["CAD", "USD", "EUR", "GBP"] as const;

export function isWisePayCurrency(currency: string): boolean {
  return (WISE_PAY_CURRENCIES as readonly string[]).includes(currency.toUpperCase());
}

/** Hosted link with amount/currency (and optional description) prefilled. */
export function buildWisePayUrl(amount: number, currency: string, description?: string): string {
  const url = new URL(WISE_PAY_LINK);
  url.searchParams.delete("utm_source");
  if (Number.isFinite(amount) && amount > 0) {
    url.searchParams.set("amount", (Math.round(amount * 100) / 100).toFixed(2));
  }
  if (currency) url.searchParams.set("currency", currency.toUpperCase());
  if (description?.trim()) url.searchParams.set("description", description.trim().slice(0, 100));
  return url.toString();
}
