export type QuoteConvention = "direct" | "indirect";

export function formatFxRateNumber(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) return "—";
  if (rate >= 100) return rate.toFixed(2);
  if (rate >= 1) return rate.toFixed(4);
  return rate.toFixed(6);
}

/**
 * `unitsOfToPerFrom` is units of `to` per 1 `from` (e.g. CAD→GHS 8.2324).
 * Indirect: foreign per 1 domestic — "1 CAD = 8.2324 GHS"
 * Direct: domestic per 1 foreign — "1 GHS = 0.121472 CAD"
 */
export function fxQuoteLabel(
  from: string,
  to: string,
  unitsOfToPerFrom: number,
  convention: QuoteConvention,
) {
  if (!from || !to || !Number.isFinite(unitsOfToPerFrom) || unitsOfToPerFrom <= 0) {
    return {
      label: "Rate unavailable",
      hint: "No live rate for this pair.",
    };
  }
  if (convention === "indirect") {
    return {
      label: `1 ${from} = ${formatFxRateNumber(unitsOfToPerFrom)} ${to}`,
      hint: `Indirect quote: how many ${to} you get for 1 ${from}.`,
    };
  }
  const inverse = 1 / unitsOfToPerFrom;
  return {
    label: `1 ${to} = ${formatFxRateNumber(inverse)} ${from}`,
    hint: `Direct quote: how much ${from} one ${to} costs.`,
  };
}
