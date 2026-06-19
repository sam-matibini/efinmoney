export type FiatRow = { from: string; to: string; price: number; change24h: number };
export type MarketResponse = { fiat: FiatRow[]; crypto: unknown[]; fetched_at: string };

export const PAYOUT_CCYS = new Set(["NGN", "KES", "GHS", "ZMW", "UGX", "TZS", "RWF", "ZAR", "XOF", "XAF", "CAD", "USD", "GBP"]);

export const EFIN_FX_MARGIN = 0.008;
export const EFIN_FLAT_FEE_USD = 0.99;
export const BENCHMARK_A_MARGIN = 0.022;
export const BENCHMARK_A_FLAT_FEE_USD = 3.99;
export const BENCHMARK_B_MARGIN = 0.018;
export const BENCHMARK_B_FLAT_FEE_USD = 0;

export const buildUsdMap = (rows: FiatRow[]): Map<string, number> => {
  const m = new Map<string, number>();
  m.set("USD", 1);
  for (const r of rows) {
    if (r.to === "USD" && !m.has(r.from)) m.set(r.from, Number(r.price));
    if (r.from === "USD" && !m.has(r.to) && Number(r.price) > 0) m.set(r.to, 1 / Number(r.price));
  }
  for (const r of rows) {
    if (!m.has(r.to) && m.has(r.from) && Number(r.price) > 0) m.set(r.to, m.get(r.from)! / Number(r.price));
    if (!m.has(r.from) && m.has(r.to) && Number(r.price) > 0) m.set(r.from, m.get(r.to)! * Number(r.price));
  }
  return m;
};

export const fmt = (n: number) => {
  if (!isFinite(n)) return "—";
  const decimals = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
};

export const parseAmount = (s: string): number => {
  const n = Number(String(s).replace(/,/g, ""));
  return isFinite(n) ? n : 0;
};

export const midRateFromUsdMap = (from: string, to: string, usdMap: Map<string, number>): number | null => {
  if (from === to) return 1;
  const fUsd = usdMap.get(from);
  const tUsd = usdMap.get(to);
  if (!fUsd || !tUsd) return null;
  return fUsd / tUsd;
};
