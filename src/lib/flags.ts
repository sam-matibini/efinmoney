// Centralized flag/country lookups for currencies displayed in the UI.

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

/** Normalize recipient_country (ISO-2 or full name) → lowercase ISO-2 for flagcdn.com. */
export const normalizeCountryCode = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 2) return trimmed.toLowerCase();
  const exact = COUNTRY_NAME_TO_CODE[trimmed];
  if (exact) return exact.toLowerCase();
  const fuzzy = Object.entries(COUNTRY_NAME_TO_CODE).find(
    ([name]) => name.toLowerCase() === trimmed.toLowerCase(),
  );
  return fuzzy ? fuzzy[1].toLowerCase() : null;
};
