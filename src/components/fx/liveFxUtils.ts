export type FiatRow = { from: string; to: string; price: number; market_price?: number; change24h: number };
export type MarketResponse = { fiat: FiatRow[]; crypto: unknown[]; fetched_at: string };

export const PAYOUT_CCYS = new Set(["NGN", "KES", "GHS", "ZMW", "UGX", "TZS", "RWF", "ZAR", "XOF", "XAF", "CAD", "USD", "GBP"]);

export const EFIN_FX_MARGIN = 0.008;
export const EFIN_FLAT_FEE_USD = 0.99;
export const BENCHMARK_A_MARGIN = 0.022;
export const BENCHMARK_A_FLAT_FEE_USD = 3.99;
export const BENCHMARK_B_MARGIN = 0.018;
export const BENCHMARK_B_FLAT_FEE_USD = 0;

const rowRate = (r: FiatRow, field: "price" | "market_price"): number => {
  const v = field === "market_price" ? (r.market_price ?? r.price) : r.price;
  return Number(v);
};

export const buildUsdMap = (rows: FiatRow[], field: "price" | "market_price" = "price"): Map<string, number> => {
  const m = new Map<string, number>();
  m.set("USD", 1);
  for (const r of rows) {
    const rate = rowRate(r, field);
    if (r.to === "USD" && !m.has(r.from)) m.set(r.from, rate);
    if (r.from === "USD" && !m.has(r.to) && rate > 0) m.set(r.to, 1 / rate);
  }
  for (const r of rows) {
    const rate = rowRate(r, field);
    if (!m.has(r.to) && m.has(r.from) && rate > 0) m.set(r.to, m.get(r.from)! / rate);
    if (!m.has(r.from) && m.has(r.to) && rate > 0) m.set(r.from, m.get(r.to)! * rate);
  }
  return m;
};

/** Recipient amount — matches Send page: (send − flat fee) × effective rate. */
export const quoteTransferRecipient = (send: number, effectiveRate: number, flatFee: number): number => {
  if (!effectiveRate || send <= 0) return 0;
  if (flatFee <= 0) return send * effectiveRate;
  return Math.max(0, (send - flatFee) * effectiveRate);
};

/** Send amount needed for a target recipient amount. */
export const quoteTransferSend = (recv: number, effectiveRate: number, flatFee: number): number => {
  if (!effectiveRate || recv <= 0) return 0;
  return recv / effectiveRate + flatFee;
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

/** Format typed amount with thousands separators; preserves in-progress decimals. */
export const formatAmountInput = (raw: string): string => {
  const clean = String(raw).replace(/[^0-9.,]/g, "").replace(/,/g, "");
  if (!clean) return "";

  const dotIdx = clean.indexOf(".");
  const hasDot = dotIdx !== -1;
  const intRaw = hasDot ? clean.slice(0, dotIdx) : clean;
  const decRaw = hasDot ? clean.slice(dotIdx + 1) : "";
  const trailingDot = hasDot && decRaw === "" && clean.endsWith(".");

  const intDigits = intRaw.replace(/\D/g, "");
  if (!intDigits && !hasDot) return "";

  const intFormatted =
    intDigits === ""
      ? "0"
      : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(intDigits));

  if (trailingDot) return `${intFormatted}.`;
  if (hasDot && decRaw) return `${intFormatted}.${decRaw}`;
  return intFormatted;
};

export const midRateFromUsdMap = (from: string, to: string, usdMap: Map<string, number>): number | null => {
  if (from === to) return 1;
  const fUsd = usdMap.get(from);
  const tUsd = usdMap.get(to);
  if (!fUsd || !tUsd) return null;
  return fUsd / tUsd;
};
