/** Customer-facing payout fees in USD. Converted to the send-currency at quote time. */
export const RETAIL_PAYOUT_FEE_USD: Record<string, number> = {
  GHS: 2,
  GH: 2,
  KES: 2,
  KE: 2,
  ZMW: 3,
  ZM: 3,
};

/** Flat fees in destination currency (e.g. NGN bank payout = ₦200). */
export const RETAIL_PAYOUT_FEE_NATIVE: Record<string, { currency: string; amount: number }> = {
  NGN: { currency: "NGN", amount: 200 },
  NG: { currency: "NGN", amount: 200 },
  NIGERIA: { currency: "NGN", amount: 200 },
};

export const LIVE_PAYIN_CURRENCIES = ["NGN", "GHS", "KES", "ZMW", "CAD", "USD"] as const;
export const LIVE_PAYOUT_CURRENCIES = ["NGN", "GHS", "KES", "ZMW", "CAD", "USD"] as const;

export function retailPayoutFeeUsd(destCurrencyOrCountry: string | null | undefined): number | null {
  const key = String(destCurrencyOrCountry || "").toUpperCase();
  const fee = RETAIL_PAYOUT_FEE_USD[key];
  return typeof fee === "number" ? fee : null;
}

export function retailPayoutFeeNative(
  destCurrencyOrCountry: string | null | undefined,
): { currency: string; amount: number } | null {
  const key = String(destCurrencyOrCountry || "").toUpperCase();
  return RETAIL_PAYOUT_FEE_NATIVE[key] ?? null;
}

export function isLivePayinCurrency(code: string | null | undefined): boolean {
  return (LIVE_PAYIN_CURRENCIES as readonly string[]).includes(String(code || "").toUpperCase());
}

export function isLivePayoutCurrency(code: string | null | undefined): boolean {
  const c = String(code || "").toUpperCase();
  if ((LIVE_PAYOUT_CURRENCIES as readonly string[]).includes(c)) return true;
  if (["NG", "GH", "KE", "ZM", "CA", "US"].includes(c)) return true;
  return ["NIGERIA", "GHANA", "KENYA", "ZAMBIA", "CANADA", "UNITED STATES", "USA"].includes(c);
}
