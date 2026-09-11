import {
  CUSTOMER_CORRIDOR_RATES,
  PAYOUT_MINIMUMS,
  VOLUME_DISCOUNT_TIERS,
  WALLET_RATES,
} from "./rateCard.ts";
import type { CorridorRateCard, PayoutMinimum, PricingWorkbook, VolumeDiscountTier } from "./types.ts";
import {
  applyCorrections,
  emptyCorrections,
  type PricingCorrections,
} from "./assembleDynamicWorkbook.ts";

const STORAGE_KEY = "efinmoney.pricing.corrections.v1";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function defaultWorkbook(): PricingWorkbook {
  return {
    corridors: clone(CUSTOMER_CORRIDOR_RATES),
    wallets: clone(WALLET_RATES),
    volumes: clone(VOLUME_DISCOUNT_TIERS),
    payouts: clone(PAYOUT_MINIMUMS),
  };
}

let liveBase: PricingWorkbook = defaultWorkbook();
let corrections: PricingCorrections = emptyCorrections();
let hydratedLocal = false;
let liveBaseSource: "checkout" | "admin" = "checkout";

function readLocalCorrections(): PricingCorrections {
  if (typeof localStorage === "undefined") return emptyCorrections();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyCorrections();
    const parsed = JSON.parse(raw) as PricingCorrections;
    return {
      corridors: parsed.corridors ?? {},
      wallets: parsed.wallets ?? {},
      volumes: parsed.volumes ?? {},
      payouts: parsed.payouts ?? {},
      extras: parsed.extras ?? [],
    };
  } catch {
    return emptyCorrections();
  }
}

function persistLocal() {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(corrections));
}

function ensureHydrated() {
  if (hydratedLocal) return;
  hydratedLocal = true;
  corrections = readLocalCorrections();
}

export function getCorrections(): PricingCorrections {
  ensureHydrated();
  return clone(corrections);
}

export function setLiveBase(next: PricingWorkbook, source: "checkout" | "admin" = "checkout") {
  if (source === "checkout" && liveBaseSource === "admin") return;
  liveBaseSource = source;
  liveBase = clone(next);
}

export function releaseAdminLiveBase() {
  if (liveBaseSource === "admin") liveBaseSource = "checkout";
}

export function setCorrections(next: PricingCorrections) {
  ensureHydrated();
  corrections = clone(next);
  persistLocal();
}

export function getWorkbook(): PricingWorkbook {
  ensureHydrated();
  return applyCorrections(liveBase, corrections);
}

/** @deprecated Use setLiveBase + setCorrections. Kept so older callers still persist a full snapshot. */
export function setWorkbook(next: PricingWorkbook) {
  liveBase = clone(next);
  persistLocal();
}

export function resetWorkbook(): PricingWorkbook {
  corrections = emptyCorrections();
  if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  return getWorkbook();
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
