/** Nomba top-up fee + FX quote helpers (CAD wallet via USD international checkout). */

export const NOMBA_TOPUP_FEE_PCT = 0.019;
export const NOMBA_TOPUP_FEE_FIXED: Record<string, number> = {
  CAD: 0.30,
  USD: 0.30,
  EUR: 0.30,
  GBP: 0.30,
  NGN: 100,
};

export type FxRateRow = {
  from_currency: string;
  to_currency: string;
  effective_rate: number;
};

export function resolveFxRate(from: string, to: string, rates: FxRateRow[]): number | null {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return 1;

  const direct = rates.find((r) => r.from_currency === f && r.to_currency === t);
  if (direct && Number(direct.effective_rate) > 0) return Number(direct.effective_rate);

  const inverse = rates.find((r) => r.from_currency === t && r.to_currency === f);
  if (inverse && Number(inverse.effective_rate) > 0) return 1 / Number(inverse.effective_rate);

  const usdMap = new Map<string, number>([["USD", 1]]);
  for (const r of rates) {
    if (r.to_currency === "USD" && !usdMap.has(r.from_currency)) {
      usdMap.set(r.from_currency, Number(r.effective_rate));
    }
  }
  for (const r of rates) {
    if (r.from_currency === "USD" && !usdMap.has(r.to_currency) && Number(r.effective_rate) > 0) {
      usdMap.set(r.to_currency, 1 / Number(r.effective_rate));
    }
  }
  const fUsd = usdMap.get(f);
  const tUsd = usdMap.get(t);
  if (fUsd && tUsd) return fUsd / tUsd;

  return null;
}

export function roundMoney(n: number, decimals = 2): number {
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
}

export type CadNombaQuote = {
  creditAmount: number;
  creditCurrency: "CAD";
  feeAmount: number;
  feeCurrency: "CAD";
  totalCad: number;
  checkoutAmount: number;
  checkoutCurrency: "USD";
  fxRateCadToUsd: number;
};

/** CAD wallet top-up: user enters CAD credit; Nomba charges USD on international checkout. */
export function quoteCadWalletViaNombaUsd(
  creditCad: number,
  cadToUsdRate: number,
): CadNombaQuote {
  const feeCad = roundMoney(creditCad * NOMBA_TOPUP_FEE_PCT + (NOMBA_TOPUP_FEE_FIXED.CAD ?? 0.30));
  const totalCad = roundMoney(creditCad + feeCad);
  const checkoutUsd = roundMoney(totalCad * cadToUsdRate);
  return {
    creditAmount: roundMoney(creditCad),
    creditCurrency: "CAD",
    feeAmount: feeCad,
    feeCurrency: "CAD",
    totalCad,
    checkoutAmount: Math.max(checkoutUsd, 1),
    checkoutCurrency: "USD",
    fxRateCadToUsd: cadToUsdRate,
  };
}

export function quoteSameCurrencyTopup(
  creditAmount: number,
  currency: string,
): { creditAmount: number; feeAmount: number; checkoutAmount: number } {
  const c = currency.toUpperCase();
  const fixed = NOMBA_TOPUP_FEE_FIXED[c] ?? 0.30;
  const fee = roundMoney(creditAmount * NOMBA_TOPUP_FEE_PCT + fixed, c === "NGN" ? 0 : 2);
  return {
    creditAmount: roundMoney(creditAmount, c === "NGN" ? 0 : 2),
    feeAmount: fee,
    checkoutAmount: roundMoney(creditAmount + fee, c === "NGN" ? 0 : 2),
  };
}
