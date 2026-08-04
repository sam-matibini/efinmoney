// Centralized flag/country lookups for currencies displayed in the UI.

import { COUNTRIES } from "@/lib/countries";
import { ISO_COUNTRIES } from "@/lib/isoCountries";

export const CURRENCY_FLAG: Record<string, string> = {
  USD: "🇺🇸", CAD: "🇨🇦", EUR: "🇪🇺", GBP: "🇬🇧", NGN: "🇳🇬",
  KES: "🇰🇪", UGX: "🇺🇬", TZS: "🇹🇿", ZMW: "🇿🇲", BIF: "🇧🇮",
  GHS: "🇬🇭", XOF: "🇸🇳", XAF: "🇨🇲", ZAR: "🇿🇦", RWF: "🇷🇼",
  AUD: "🇦🇺", JPY: "🇯🇵", CHF: "🇨🇭", CNY: "🇨🇳", INR: "🇮🇳",
  BTC: "₿", USDT: "🪙", USDC: "🪙",
};

export const COUNTRY_FLAG: Record<string, string> = {
  US: "🇺🇸", CA: "🇨🇦", GB: "🇬🇧", NG: "🇳🇬", KE: "🇰🇪",
  UG: "🇺🇬", TZ: "🇹🇿", ZM: "🇿🇲", BI: "🇧🇮", GH: "🇬🇭",
  SN: "🇸🇳", CM: "🇨🇲", ZA: "🇿🇦", RW: "🇷🇼", EU: "🇪🇺",
};

export const flagForCurrency = (code?: string | null): string => {
  if (!code) return "🌍";
  return CURRENCY_FLAG[code.toUpperCase()] || "🌍";
};

export const flagForCountry = (code?: string | null): string => {
  if (!code) return "🌍";
  return COUNTRY_FLAG[code.toUpperCase()] || "🌍";
};

// Map common payout countries (full names) → ISO code for flag lookup.
export const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  Kenya: "KE", Uganda: "UG", Tanzania: "TZ", Zambia: "ZM", Burundi: "BI",
  Canada: "CA", "United States": "US", Nigeria: "NG", Ghana: "GH",
  "United Kingdom": "GB", Senegal: "SN", Cameroon: "CM",
  Rwanda: "RW", "South Africa": "ZA",
};

export const flagForCountryName = (name?: string | null): string => {
  if (!name) return "🌍";
  const code = COUNTRY_NAME_TO_CODE[name];
  return code ? flagForCountry(code) : "🌍";
};

/** Payout currency code (NGN, KES, …) → lowercase ISO-2 for flagcdn.com. */
const CURRENCY_TO_ISO: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const c of COUNTRIES) {
    const fromName = COUNTRY_NAME_TO_CODE[c.country];
    const fromIso = ISO_COUNTRIES.find(
      (i) => i.name.toLowerCase() === c.country.toLowerCase() || i.name === c.id,
    )?.code;
    const iso = fromName ?? fromIso;
    if (iso) map[c.code.toUpperCase()] = iso.toLowerCase();
  }
  return map;
})();

const NON_COUNTRY_TOKENS = new Set(["BILL", "INTERNAL", "UNKNOWN"]);

/** Approximate [lng, lat] centroids for corridor markers on the globe. */
export const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  us: [-98.58, 39.83], ca: [-106.35, 56.13], gb: [-2.58, 54.7], ng: [8.68, 9.08],
  ke: [37.91, 0.02], gh: [-1.02, 7.95], ug: [32.29, 1.37], tz: [34.89, -6.37],
  zm: [27.85, -13.13], za: [22.94, -30.56], rw: [29.87, -1.94], sn: [-14.45, 14.5],
  cm: [12.35, 7.37], in: [78.96, 20.59], au: [133.78, -25.27], mx: [-102.55, 23.63],
  br: [-51.93, -14.24], jp: [138.25, 36.2], cn: [104.2, 35.86], ae: [53.85, 23.42],
  bi: [29.92, -3.37],
};

/**
 * Normalize recipient_country (ISO-2, currency code, or full name)
 * → lowercase ISO-2 for flagcdn.com.
 */
export const normalizeCountryCode = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();
  if (NON_COUNTRY_TOKENS.has(upper)) return null;
  if (trimmed.length === 2) return trimmed.toLowerCase();
  const fromCurrency = CURRENCY_TO_ISO[upper];
  if (fromCurrency) return fromCurrency;
  const exact = COUNTRY_NAME_TO_CODE[trimmed];
  if (exact) return exact.toLowerCase();
  const fuzzy = Object.entries(COUNTRY_NAME_TO_CODE).find(
    ([name]) => name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (fuzzy) return fuzzy[1].toLowerCase();
  const iso = ISO_COUNTRIES.find((i) => i.name.toLowerCase() === trimmed.toLowerCase());
  return iso ? iso.code.toLowerCase() : null;
};

