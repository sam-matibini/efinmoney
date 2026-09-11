import {
  CUSTOMER_CORRIDOR_RATES,
  PAYOUT_MINIMUMS,
  VOLUME_DISCOUNT_TIERS,
  WALLET_RATES,
} from "./rateCard.ts";
import type { CorridorRateCard, PayoutMinimum, VolumeDiscountTier } from "./types.ts";

export type PricingWorkbook = {
  corridors: CorridorRateCard[];
  wallets: CorridorRateCard[];
  volumes: VolumeDiscountTier[];
  payouts: PayoutMinimum[];
};

const STORAGE_KEY = "efinmoney.pricing.workbook.v1";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function defaultWorkbook(): PricingWorkbook {
  return {
    corridors: clone(CUSTOMER_CORRIDOR_RATES),
    wallets: clone(WALLET_RATES),
    volumes: clone(VOLUME_DISCOUNT_TIERS),
    payouts: clone(PAYOUT_MINIMUMS),
  };
}

let memory: PricingWorkbook | null = null;

function readLocal(): PricingWorkbook | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PricingWorkbook;
    if (!Array.isArray(parsed?.corridors) || !Array.isArray(parsed?.wallets)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getWorkbook(): PricingWorkbook {
  if (!memory) memory = readLocal() ?? defaultWorkbook();
  return memory;
}

export function setWorkbook(next: PricingWorkbook) {
  memory = clone(next);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  }
}

export function resetWorkbook(): PricingWorkbook {
  memory = defaultWorkbook();
  if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  return clone(memory);
}

export function getActiveRateCards(): CorridorRateCard[] {
  const wb = getWorkbook();
  return [...wb.wallets, ...wb.corridors];
}

export function getVolumeTiers(): VolumeDiscountTier[] {
  return getWorkbook().volumes;
}

export function getPayoutMins(): PayoutMinimum[] {
  return getWorkbook().payouts;
}
