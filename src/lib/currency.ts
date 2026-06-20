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
  CH: "CHF", JP: "JPY", CN: "CNY", HK: "HKD", SG: "SGD",
  NG: "NGN", KE: "KES", UG: "UGX", TZ: "TZS", RW: "RWF",
  ZM: "ZMW", GH: "GHS", ZA: "ZAR", CI: "XOF", SN: "XOF",
  CM: "XAF", EG: "EGP", MA: "MAD", IN: "INR", BR: "BRL",
  MX: "MXN", AE: "AED", SA: "SAR", TR: "TRY",
};

export const countryToCurrency = (cc?: string | null): string | null => {
  if (!cc) return null;
  return COUNTRY_CCY[cc.toUpperCase()] || null;
};
