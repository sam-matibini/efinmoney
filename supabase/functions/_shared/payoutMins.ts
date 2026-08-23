/**
 * Provider destination payout floors (same-currency receive amount).
 * Keep in sync with UI checks on Send.
 */
export const PAYOUT_MIN_BY_CURRENCY: Record<string, number> = {
  NGN: 100,
  // Fincra KES MoMo flat fee is ~100 KES — sending ≤ fee fails downstream.
  KES: 150,
  GHS: 10,
  USD: 1,
  UGX: 500,
  TZS: 1000,
  ZMW: 5,
  RWF: 500,
  XAF: 500,
  XOF: 500,
  CAD: 1,
  GBP: 1,
  EUR: 1,
  ZAR: 10,
};

export function payoutMinAmount(currency: string): number {
  return PAYOUT_MIN_BY_CURRENCY[String(currency || "").toUpperCase()] ?? 1;
}

/** Returns an error message when destination amount is below the provider floor. */
export function validatePayoutMin(
  currency: string,
  amount: number,
): string | null {
  const ccy = String(currency || "").toUpperCase();
  const min = payoutMinAmount(ccy);
  if (!Number.isFinite(amount) || amount < min) {
    return `Minimum send to ${ccy} is ${min.toLocaleString()} ${ccy}. Increase the amount and try again.`;
  }
  return null;
}
