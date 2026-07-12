import { resolveEffectiveRate, type RateRow } from "@/lib/fxRatesCore";

export const NOMBA_TOPUP_FEE_PCT = 0.019;
export const NOMBA_TOPUP_FEE_FIXED: Record<string, number> = {
  CAD: 0.30,
  USD: 0.30,
  EUR: 0.30,
  GBP: 0.30,
  NGN: 100,
};

export type NombaTopupQuote = {
  creditAmount: number;
  creditCurrency: string;
  feeAmount: number;
  checkoutAmount: number;
  checkoutCurrency: string;
  fxRate?: number;
};

function roundMoney(n: number, decimals = 2): number {
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
}

/** Preview CAD wallet top-up: user enters CAD, pays USD on Nomba international checkout. */
export function quoteCadNombaTopup(creditCad: number, fxRates: RateRow[]): NombaTopupQuote | null {
  const cadToUsd = resolveEffectiveRate("CAD", "USD", fxRates);
  if (!cadToUsd || cadToUsd <= 0) return null;

  const feeCad = roundMoney(creditCad * NOMBA_TOPUP_FEE_PCT + NOMBA_TOPUP_FEE_FIXED.CAD);
  const totalCad = roundMoney(creditCad + feeCad);
  const checkoutUsd = roundMoney(Math.max(totalCad * cadToUsd, 1));

  return {
    creditAmount: roundMoney(creditCad),
    creditCurrency: "CAD",
    feeAmount: feeCad,
    checkoutAmount: checkoutUsd,
    checkoutCurrency: "USD",
    fxRate: cadToUsd,
  };
}

export function quoteDirectNombaTopup(creditAmount: number, currency: string): NombaTopupQuote {
  const c = currency.toUpperCase();
  const fixed = NOMBA_TOPUP_FEE_FIXED[c] ?? 0.30;
  const decimals = c === "NGN" ? 0 : 2;
  const fee = roundMoney(creditAmount * NOMBA_TOPUP_FEE_PCT + fixed, decimals);
  const credit = roundMoney(creditAmount, decimals);
  return {
    creditAmount: credit,
    creditCurrency: c,
    feeAmount: fee,
    checkoutAmount: roundMoney(credit + fee, decimals),
    checkoutCurrency: c,
  };
}
