export interface RateRow {
  from_currency: string;
  to_currency: string;
  effective_rate: number;
}

/** Build a lookup of latest from→USD rates from a list of fx_rates rows. */
export const buildUsdRateMap = (rates: RateRow[]): Map<string, number> => {
  const map = new Map<string, number>();
  map.set("USD", 1);
  for (const r of rates) {
    if (r.to_currency === "USD" && !map.has(r.from_currency)) {
      map.set(r.from_currency, Number(r.effective_rate));
    }
  }
  for (const r of rates) {
    if (r.from_currency === "USD" && !map.has(r.to_currency) && Number(r.effective_rate) > 0) {
      map.set(r.to_currency, 1 / Number(r.effective_rate));
    }
  }
  return map;
};

/** Resolve from→to effective rate from fx_rates rows (direct, inverse, or USD cross). */
export const resolveEffectiveRate = (
  from: string,
  to: string,
  rates: RateRow[],
): number | null => {
  if (from === to) return 1;
  if (!rates.length) return null;

  const direct = rates.find((r) => r.from_currency === from && r.to_currency === to);
  if (direct && Number(direct.effective_rate) > 0) return Number(direct.effective_rate);

  const inverse = rates.find((r) => r.from_currency === to && r.to_currency === from);
  if (inverse && Number(inverse.effective_rate) > 0) return 1 / Number(inverse.effective_rate);

  if (from !== "USD" && to !== "USD") {
    const toUsd = rates.find((r) => r.from_currency === from && r.to_currency === "USD");
    const fromUsd = rates.find((r) => r.from_currency === "USD" && r.to_currency === to);
    if (toUsd && fromUsd && Number(toUsd.effective_rate) > 0 && Number(fromUsd.effective_rate) > 0) {
      return Number(toUsd.effective_rate) * Number(fromUsd.effective_rate);
    }
    const usdFromInv = rates.find((r) => r.from_currency === "USD" && r.to_currency === from);
    const usdToInv = rates.find((r) => r.from_currency === to && r.to_currency === "USD");
    const legFrom =
      toUsd && Number(toUsd.effective_rate) > 0
        ? Number(toUsd.effective_rate)
        : usdFromInv && Number(usdFromInv.effective_rate) > 0
          ? 1 / Number(usdFromInv.effective_rate)
          : null;
    const legTo =
      fromUsd && Number(fromUsd.effective_rate) > 0
        ? Number(fromUsd.effective_rate)
        : usdToInv && Number(usdToInv.effective_rate) > 0
          ? 1 / Number(usdToInv.effective_rate)
          : null;
    if (legFrom && legTo) return legFrom * legTo;
  }

  const usdMap = buildUsdRateMap(rates);
  const fUsd = usdMap.get(from);
  const tUsd = usdMap.get(to);
  if (fUsd && tUsd) return fUsd / tUsd;

  return null;
};
