import { buildUsdRateMap, convertToUsd } from "@/lib/fx";
import type { RateRow } from "@/lib/fxRatesCore";

export const BUDGET_STORAGE_KEY = "efm.monthlyBudget";

export function readMonthlyBudget(): number | null {
  try {
    const raw = localStorage.getItem(BUDGET_STORAGE_KEY);
    if (!raw) return null;
    const amount = Number(raw);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  } catch {
    return null;
  }
}

export function writeMonthlyBudget(amount: number) {
  localStorage.setItem(BUDGET_STORAGE_KEY, String(amount));
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function flagEmoji(code: string) {
  const country = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return "";
  return String.fromCodePoint(...country.split("").map((char) => 127397 + char.charCodeAt(0)));
}

export function toDisplayAmount(
  amount: number,
  from: string,
  to: string,
  rates: RateRow[],
): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from.toUpperCase() === to.toUpperCase()) return amount;
  const rateMap = buildUsdRateMap(rates);
  const usd = convertToUsd(amount, from.toUpperCase(), rateMap);
  const toUsd = rateMap.get(to.toUpperCase());
  if (usd === null || toUsd === undefined || toUsd === 0) return null;
  return usd / toUsd;
}
