// Friendly payout-partner (mobile money operator) labels for recipients.
// One source of truth so contacts, details sheet and send rows never show a
// generic "MoMo" for an Airtel / MTN / Zamtel subscriber.

import { COUNTRIES } from "@/lib/countries";

interface PartnerLike {
  country_code?: string | null;
  payout_method?: string | null;
  network?: string | null;
  phone?: string | null;
  tel?: string | null;
  bank_account?: string | null;
  bank_name?: string | null;
}

/** Canonical operator display names keyed by a normalized operator id. */
const OPERATOR_LABELS: Record<string, string> = {
  mtn: "MTN MoMo",
  airtel: "Airtel Money",
  airteltigo: "AirtelTigo Money",
  zamtel: "Zamtel Kwacha",
  vodafone: "Vodafone Cash",
  vodacom: "Vodacom M-Pesa",
  mpesa: "M-Pesa",
  tigo: "Tigo Pesa",
  halopesa: "Halopesa",
  orange: "Orange Money",
  moov: "Moov Money",
  wave: "Wave",
  free: "Free Money",
  africell: "Africell Money",
  lonestar: "Lonestar MTN",
  tnm: "TNM Mpamba",
  lumicash: "Lumicash",
  onatel: "ONATEL",
  emola: "eMola",
  mkesh: "mKesh",
  myzaka: "Mascom MyZaka",
  smega: "BTC Smega",
};

/** Map any stored token (network id, payout_method, provider code) to an operator id. */
const normalizeOperator = (raw?: string | null): string | null => {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (!s || s === "mobilemoney" || s === "momo" || s === "mobile" || s === "bank") return null;
  if (s.includes("airteltigo")) return "airteltigo";
  if (s.includes("airtel")) return "airtel";
  if (s.includes("mtn") || s.includes("momopay")) return "mtn";
  if (s.includes("zamtel")) return "zamtel";
  if (s.includes("vodacom")) return "vodacom";
  if (s.includes("vodafone")) return "vodafone";
  if (s.includes("mpesa") || s === "mps" || s.includes("safaricom")) return "mpesa";
  if (s.includes("halopesa")) return "halopesa";
  if (s.includes("tigo")) return "tigo";
  if (s.includes("orange")) return "orange";
  if (s.includes("moov")) return "moov";
  if (s.includes("wave")) return "wave";
  if (s.includes("africell")) return "africell";
  if (s.includes("lonestar")) return "lonestar";
  if (s.includes("tnm") || s.includes("mpamba")) return "tnm";
  if (s.includes("lumicash")) return "lumicash";
  if (s.includes("onatel")) return "onatel";
  if (s.includes("emola")) return "emola";
  if (s.includes("mkesh")) return "mkesh";
  if (s.includes("myzaka") || s.includes("mascom")) return "myzaka";
  if (s.includes("smega") || s.includes("epula")) return "smega";
  if (s === "free" || s.includes("sonatel")) return "free";
  return null;
};

/** Digits only, dial code stripped, leading 0 removed. */
const nationalDigits = (phone: string, dial: string): string => {
  let d = phone.replace(/\D/g, "");
  while (d.startsWith(dial + dial)) d = d.slice(dial.length);
  if (d.startsWith(dial)) d = d.slice(dial.length);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
};

/**
 * Prefix → operator maps for the corridors we support.
 * Keys are the national prefix after stripping the dial code and leading 0.
 */
const PREFIX_MAPS: Record<string, { dial: string; prefixes: Record<string, string> }> = {
  // Zambia: 76/96 Airtel, 77/97 MTN, 75/95 Zamtel
  ZMW: {
    dial: "260",
    prefixes: {
      "76": "airtel", "96": "airtel",
      "77": "mtn", "97": "mtn",
      "75": "zamtel", "95": "zamtel",
    },
  },
  // Uganda: 70/74/75 Airtel, 76/77/78/79 MTN
  UGX: {
    dial: "256",
    prefixes: {
      "70": "airtel", "74": "airtel", "75": "airtel",
      "76": "mtn", "77": "mtn", "78": "mtn", "79": "mtn",
    },
  },
  // Ghana: 24/54/55/59 MTN, 20/50 Vodafone, 26/27/56/57 AirtelTigo
  GHS: {
    dial: "233",
    prefixes: {
      "24": "mtn", "54": "mtn", "55": "mtn", "59": "mtn",
      "20": "vodafone", "50": "vodafone",
      "26": "airteltigo", "27": "airteltigo", "56": "airteltigo", "57": "airteltigo",
    },
  },
  // Rwanda: 78/79 MTN, 72/73 Airtel
  RWF: { dial: "250", prefixes: { "78": "mtn", "79": "mtn", "72": "airtel", "73": "airtel" } },
};

const currencyForCountry = (countryCode?: string | null): string | null => {
  if (!countryCode) return null;
  const c = COUNTRIES.find((x) => x.code === countryCode || x.id === countryCode);
  return c?.code ?? countryCode;
};

const inferFromPhone = (phone?: string | null, countryCode?: string | null): string | null => {
  if (!phone) return null;
  const cur = currencyForCountry(countryCode);
  const map = cur ? PREFIX_MAPS[cur] : undefined;
  if (!map) return null;
  const nat = nationalDigits(phone, map.dial);
  return map.prefixes[nat.slice(0, 2)] ?? null;
};

/** Resolve the operator id for a recipient, or null when unknown. */
export const resolvePayoutOperator = (b: PartnerLike): string | null =>
  normalizeOperator(b.network) ??
  normalizeOperator(b.payout_method) ??
  inferFromPhone(b.phone || b.tel, b.country_code);

/** Friendly operator name, e.g. "Airtel Money". Falls back to "Mobile money". */
export const payoutPartnerLabel = (b: PartnerLike): string => {
  const op = resolvePayoutOperator(b);
  return op ? OPERATOR_LABELS[op] ?? op.toUpperCase() : "Mobile money";
};

/** Line shown under a contact name: bank details or the mobile money partner. */
export const payoutMethodLabel = (b: PartnerLike): string => {
  if (b.bank_account) return `Bank · ${b.bank_name || ""}`.trim();
  return payoutPartnerLabel(b);
};
