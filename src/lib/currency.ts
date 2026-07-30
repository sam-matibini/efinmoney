// Currency symbol + ISO country → currency helpers

const SYMBOLS: Record<string, string> = {
  USD: "$", CAD: "C$", AUD: "A$", NZD: "NZ$", HKD: "HK$", SGD: "S$",
  EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", CHF: "CHF",
  NGN: "₦", KES: "KSh", UGX: "USh", TZS: "TSh", RWF: "FRw",
  ZMW: "ZK", GHS: "₵", ZAR: "R", XOF: "CFA", XAF: "FCFA",
  BWP: "P", EGP: "E£", MAD: "DH", INR: "₹", BRL: "R$", MXN: "MX$",
  AED: "د.إ", SAR: "﷼", TRY: "₺",
};

export const currencySymbol = (code?: string | null): string => {
  if (!code) return "$";
  return SYMBOLS[code.toUpperCase()] || code.toUpperCase();
};

// ISO‑2 country code → primary currency code
const COUNTRY_CCY: Record<string, string> = {
  US: "USD", CA: "CAD", GB: "GBP", AU: "AUD", NZ: "NZD",
  IE: "EUR", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", NL: "EUR",
  BE: "EUR", PT: "EUR", AT: "EUR", FI: "EUR", GR: "EUR", LU: "EUR",
  CY: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", MT: "EUR", SI: "EUR",
  SK: "EUR", HR: "EUR",
  CH: "CHF", JP: "JPY", CN: "CNY", HK: "HKD", SG: "SGD",
  NG: "NGN", KE: "KES", UG: "UGX", TZ: "TZS", RW: "RWF",
  ZM: "ZMW", GH: "GHS", ZA: "ZAR", CI: "XOF", SN: "XOF",
  CM: "XAF", EG: "EGP", MA: "MAD", IN: "INR", BR: "BRL",
  MX: "MXN", AE: "AED", SA: "SAR", TR: "TRY",
  // Rest of Europe
  NO: "NOK", SE: "SEK", DK: "DKK", IS: "ISK", PL: "PLN",
  CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", RS: "RSD",
  UA: "UAH", RU: "RUB",
  // Rest of Africa
  ET: "ETB", MW: "MWK", MZ: "MZN", BW: "BWP", NA: "NAD",
  ZW: "ZWL", AO: "AOA", CD: "CDF", SL: "SLE", LR: "LRD",
  GM: "GMD", TN: "TND", DZ: "DZD", LY: "LYD", SD: "SDG",
  BF: "XOF", ML: "XOF", NE: "XOF", TG: "XOF", BJ: "XOF", GW: "XOF",
  GA: "XAF", CG: "XAF", TD: "XAF", CF: "XAF", GQ: "XAF",
  // Asia-Pacific
  KR: "KRW", TW: "TWD", TH: "THB", VN: "VND", PH: "PHP",
  ID: "IDR", MY: "MYR", PK: "PKR", BD: "BDT", LK: "LKR",
  NP: "NPR", MM: "MMK", KH: "KHR", FJ: "FJD",
  // Americas & Middle East
  AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", UY: "UYU",
  JM: "JMD", TT: "TTD", DO: "DOP", GT: "GTQ", CR: "CRC",
  IL: "ILS", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR", JO: "JOD",
  LB: "LBP", IQ: "IQD",
};

// ISO‑3 → ISO‑2 for the countries whose alpha‑3 code may be stored instead.
const ISO3_TO_ISO2: Record<string, string> = {
  USA: "US", CAN: "CA", GBR: "GB", AUS: "AU", NZL: "NZ",
  NGA: "NG", GHA: "GH", KEN: "KE", ZAF: "ZA", ZMB: "ZM",
  UGA: "UG", TZA: "TZ", RWA: "RW", CMR: "CM", CIV: "CI",
  SEN: "SN", EGY: "EG", MAR: "MA", IND: "IN", BRA: "BR",
  MEX: "MX", ARE: "AE", SAU: "SA", TUR: "TR", CHE: "CH",
  JPN: "JP", CHN: "CN", HKG: "HK", SGP: "SG", FRA: "FR",
  DEU: "DE", ESP: "ES", ITA: "IT", NLD: "NL", IRL: "IE",
};

/**
 * Resolve a country code to its primary currency.
 * Accepts ISO‑2 ("CA") or ISO‑3 ("CAN"); returns null when unknown.
 */
export const countryToCurrency = (cc?: string | null): string | null => {
  if (!cc) return null;
  const key = cc.trim().toUpperCase();
  if (key.length === 3 && ISO3_TO_ISO2[key]) return COUNTRY_CCY[ISO3_TO_ISO2[key]] || null;
  return COUNTRY_CCY[key.slice(0, 2)] || null;
};
