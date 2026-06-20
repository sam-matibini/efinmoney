// Centralized country dataset used by all country pickers (Add Contact, Send page, etc.).
// `code` = currency code (used as payout currency token in transfers / beneficiaries).
// `id` = unique key (country name) — required because some currencies (XOF, XAF) span countries.

export type CountryRegion =
  | "Popular"
  | "Africa"
  | "North America"
  | "Europe"
  | "Asia / Middle East"
  | "South America / Oceania";

export interface NetworkOption {
  id: string;        // e.g. "mtn", "airtel", "zamtel"
  label: string;     // display label
  payout: string;    // payout_method token saved on transfers/beneficiaries
}

export interface CountryInfo {
  id: string;          // unique
  country: string;     // display name
  code: string;        // currency code
  flag: string;
  method: string;
  payout: string;
  region: Exclude<CountryRegion, "Popular">;
  symbol?: string;
  networks?: NetworkOption[]; // when set, user can pick a mobile-money network
}

export const COUNTRIES: CountryInfo[] = [
  // AFRICA
  { id: "Kenya", country: "Kenya", code: "KES", flag: "🇰🇪", method: "M-Pesa", payout: "mpesa", region: "Africa", symbol: "KSh" },
  { id: "Nigeria", country: "Nigeria", code: "NGN", flag: "🇳🇬", method: "Bank/Mobile", payout: "bank", region: "Africa", symbol: "₦" },
  { id: "Ghana", country: "Ghana", code: "GHS", flag: "🇬🇭", method: "Mobile Money", payout: "mtn_mobile", region: "Africa", symbol: "GH₵", networks: [
    { id: "mtn", label: "MTN Mobile Money", payout: "mtn_mobile" },
    { id: "vodafone", label: "Vodafone Cash", payout: "vodafone_money" },
    { id: "airteltigo", label: "AirtelTigo Money", payout: "airteltigo_money" },
  ]},
  { id: "Uganda", country: "Uganda", code: "UGX", flag: "🇺🇬", method: "Mobile Money", payout: "airtel_money", region: "Africa", symbol: "USh" },
  { id: "Tanzania", country: "Tanzania", code: "TZS", flag: "🇹🇿", method: "M-Pesa", payout: "mpesa", region: "Africa", symbol: "TSh" },
  { id: "Zambia", country: "Zambia", code: "ZMW", flag: "🇿🇲", method: "Mobile Money", payout: "mtn_mobile", region: "Africa", symbol: "ZK", networks: [
    { id: "mtn", label: "MTN Mobile Money", payout: "mtn_mobile" },
    { id: "airtel", label: "Airtel Money", payout: "airtel_money" },
    { id: "zamtel", label: "Zamtel Kwacha", payout: "zamtel_money" },
  ] },
  { id: "Rwanda", country: "Rwanda", code: "RWF", flag: "🇷🇼", method: "Mobile Money", payout: "mtn_mobile", region: "Africa", symbol: "RF" },
  { id: "Ethiopia", country: "Ethiopia", code: "ETB", flag: "🇪🇹", method: "Bank Transfer", payout: "bank", region: "Africa" },
  { id: "Senegal", country: "Senegal", code: "XOF", flag: "🇸🇳", method: "Wave/Orange", payout: "mobile_money", region: "Africa" },
  { id: "Ivory Coast", country: "Ivory Coast", code: "XOF", flag: "🇨🇮", method: "Wave/Orange", payout: "mobile_money", region: "Africa" },
  { id: "Cameroon", country: "Cameroon", code: "XAF", flag: "🇨🇲", method: "MTN Mobile", payout: "mtn_mobile", region: "Africa" },
  { id: "South Africa", country: "South Africa", code: "ZAR", flag: "🇿🇦", method: "Bank Transfer", payout: "bank", region: "Africa", symbol: "R" },
  { id: "Mozambique", country: "Mozambique", code: "MZN", flag: "🇲🇿", method: "M-Pesa", payout: "mpesa", region: "Africa", symbol: "MT" },
  { id: "Malawi", country: "Malawi", code: "MWK", flag: "🇲🇼", method: "Airtel Money", payout: "airtel_money", region: "Africa" },
  { id: "Benin", country: "Benin", code: "XOF", flag: "🇧🇯", method: "Mobile Money", payout: "mobile_money", region: "Africa" },
  { id: "Togo", country: "Togo", code: "XOF", flag: "🇹🇬", method: "Mobile Money", payout: "mobile_money", region: "Africa" },
  { id: "Burkina Faso", country: "Burkina Faso", code: "XOF", flag: "🇧🇫", method: "Mobile Money", payout: "mobile_money", region: "Africa" },
  { id: "Mali", country: "Mali", code: "XOF", flag: "🇲🇱", method: "Mobile Money", payout: "mobile_money", region: "Africa" },
  { id: "Niger", country: "Niger", code: "XOF", flag: "🇳🇪", method: "Mobile Money", payout: "mobile_money", region: "Africa" },
  { id: "Guinea", country: "Guinea", code: "GNF", flag: "🇬🇳", method: "Orange Money", payout: "mobile_money", region: "Africa" },
  { id: "Sierra Leone", country: "Sierra Leone", code: "SLL", flag: "🇸🇱", method: "Orange Money", payout: "mobile_money", region: "Africa" },
  { id: "Liberia", country: "Liberia", code: "LRD", flag: "🇱🇷", method: "MTN Mobile", payout: "mtn_mobile", region: "Africa" },
  { id: "Gambia", country: "Gambia", code: "GMD", flag: "🇬🇲", method: "Mobile Money", payout: "mobile_money", region: "Africa" },
  { id: "Congo", country: "Congo", code: "XAF", flag: "🇨🇬", method: "Mobile Money", payout: "mobile_money", region: "Africa" },
  { id: "DR Congo", country: "DR Congo", code: "CDF", flag: "🇨🇩", method: "M-Pesa", payout: "mpesa", region: "Africa" },
  { id: "Angola", country: "Angola", code: "AOA", flag: "🇦🇴", method: "Bank Transfer", payout: "bank", region: "Africa" },
  { id: "Namibia", country: "Namibia", code: "NAD", flag: "🇳🇦", method: "Bank Transfer", payout: "bank", region: "Africa" },
  { id: "Botswana", country: "Botswana", code: "BWP", flag: "🇧🇼", method: "Mobile Money / Bank", payout: "orange_money", region: "Africa", symbol: "P", networks: [
    { id: "orange", label: "Orange Money Botswana", payout: "orange_money" },
    { id: "myzaka", label: "Mascom MyZaka", payout: "myzaka" },
    { id: "smega", label: "BTC Smega / e-Pula", payout: "smega" },
    { id: "bank", label: "Bank Transfer", payout: "bank" },
  ] },
  { id: "Madagascar", country: "Madagascar", code: "MGA", flag: "🇲🇬", method: "Mobile Money", payout: "mobile_money", region: "Africa" },
  { id: "South Sudan", country: "South Sudan", code: "SSP", flag: "🇸🇸", method: "Bank Transfer", payout: "bank", region: "Africa" },
  { id: "Sudan", country: "Sudan", code: "SDG", flag: "🇸🇩", method: "Bank Transfer", payout: "bank", region: "Africa" },
  { id: "Burundi", country: "Burundi", code: "BIF", flag: "🇧🇮", method: "Lumicash", payout: "lumicash", region: "Africa", symbol: "FBu" },
  { id: "Egypt", country: "Egypt", code: "EGP", flag: "🇪🇬", method: "Bank Transfer", payout: "bank", region: "Africa" },
  { id: "Morocco", country: "Morocco", code: "MAD", flag: "🇲🇦", method: "Bank Transfer", payout: "bank", region: "Africa" },
  { id: "Tunisia", country: "Tunisia", code: "TND", flag: "🇹🇳", method: "Bank Transfer", payout: "bank", region: "Africa" },
  { id: "Algeria", country: "Algeria", code: "DZD", flag: "🇩🇿", method: "Bank Transfer", payout: "bank", region: "Africa" },

  // NORTH AMERICA
  { id: "Canada", country: "Canada", code: "CAD", flag: "🇨🇦", method: "Interac/Bank", payout: "bank", region: "North America", symbol: "C$" },
  { id: "United States", country: "United States", code: "USD", flag: "🇺🇸", method: "ACH/Bank", payout: "bank", region: "North America", symbol: "$" },
  { id: "Mexico", country: "Mexico", code: "MXN", flag: "🇲🇽", method: "Bank/SPEI", payout: "bank", region: "North America" },
  { id: "Jamaica", country: "Jamaica", code: "JMD", flag: "🇯🇲", method: "Bank Transfer", payout: "bank", region: "North America" },
  { id: "Trinidad & Tobago", country: "Trinidad & Tobago", code: "TTD", flag: "🇹🇹", method: "Bank Transfer", payout: "bank", region: "North America" },
  { id: "Barbados", country: "Barbados", code: "BBD", flag: "🇧🇧", method: "Bank Transfer", payout: "bank", region: "North America" },
  { id: "Haiti", country: "Haiti", code: "HTG", flag: "🇭🇹", method: "MonCash", payout: "mobile_money", region: "North America" },
  { id: "Dominican Republic", country: "Dominican Republic", code: "DOP", flag: "🇩🇴", method: "Bank Transfer", payout: "bank", region: "North America" },

  // EUROPE
  { id: "United Kingdom", country: "United Kingdom", code: "GBP", flag: "🇬🇧", method: "Faster Payments", payout: "bank", region: "Europe", symbol: "£" },
  { id: "Germany", country: "Germany", code: "EUR", flag: "🇩🇪", method: "SEPA", payout: "bank", region: "Europe", symbol: "€" },
  { id: "France", country: "France", code: "EUR", flag: "🇫🇷", method: "SEPA", payout: "bank", region: "Europe", symbol: "€" },
  { id: "Italy", country: "Italy", code: "EUR", flag: "🇮🇹", method: "SEPA", payout: "bank", region: "Europe", symbol: "€" },
  { id: "Spain", country: "Spain", code: "EUR", flag: "🇪🇸", method: "SEPA", payout: "bank", region: "Europe", symbol: "€" },
  { id: "Netherlands", country: "Netherlands", code: "EUR", flag: "🇳🇱", method: "SEPA", payout: "bank", region: "Europe", symbol: "€" },
  { id: "Belgium", country: "Belgium", code: "EUR", flag: "🇧🇪", method: "SEPA", payout: "bank", region: "Europe", symbol: "€" },
  { id: "Portugal", country: "Portugal", code: "EUR", flag: "🇵🇹", method: "SEPA", payout: "bank", region: "Europe", symbol: "€" },
  { id: "Ireland", country: "Ireland", code: "EUR", flag: "🇮🇪", method: "SEPA", payout: "bank", region: "Europe", symbol: "€" },
  { id: "Sweden", country: "Sweden", code: "SEK", flag: "🇸🇪", method: "Bank Transfer", payout: "bank", region: "Europe" },
  { id: "Norway", country: "Norway", code: "NOK", flag: "🇳🇴", method: "Bank Transfer", payout: "bank", region: "Europe" },
  { id: "Denmark", country: "Denmark", code: "DKK", flag: "🇩🇰", method: "Bank Transfer", payout: "bank", region: "Europe" },
  { id: "Switzerland", country: "Switzerland", code: "CHF", flag: "🇨🇭", method: "Bank Transfer", payout: "bank", region: "Europe", symbol: "CHF" },
  { id: "Austria", country: "Austria", code: "EUR", flag: "🇦🇹", method: "SEPA", payout: "bank", region: "Europe", symbol: "€" },
  { id: "Poland", country: "Poland", code: "PLN", flag: "🇵🇱", method: "Bank Transfer", payout: "bank", region: "Europe" },

  // ASIA / MIDDLE EAST
  { id: "India", country: "India", code: "INR", flag: "🇮🇳", method: "UPI/IMPS", payout: "bank", region: "Asia / Middle East", symbol: "₹" },
  { id: "Pakistan", country: "Pakistan", code: "PKR", flag: "🇵🇰", method: "Bank/Easypaisa", payout: "bank", region: "Asia / Middle East" },
  { id: "Bangladesh", country: "Bangladesh", code: "BDT", flag: "🇧🇩", method: "bKash", payout: "mobile_money", region: "Asia / Middle East" },
  { id: "Philippines", country: "Philippines", code: "PHP", flag: "🇵🇭", method: "GCash/Bank", payout: "mobile_money", region: "Asia / Middle East" },
  { id: "China", country: "China", code: "CNY", flag: "🇨🇳", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East", symbol: "¥" },
  { id: "Japan", country: "Japan", code: "JPY", flag: "🇯🇵", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East", symbol: "¥" },
  { id: "South Korea", country: "South Korea", code: "KRW", flag: "🇰🇷", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East", symbol: "₩" },
  { id: "Vietnam", country: "Vietnam", code: "VND", flag: "🇻🇳", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East" },
  { id: "Indonesia", country: "Indonesia", code: "IDR", flag: "🇮🇩", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East" },
  { id: "Malaysia", country: "Malaysia", code: "MYR", flag: "🇲🇾", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East" },
  { id: "Singapore", country: "Singapore", code: "SGD", flag: "🇸🇬", method: "PayNow/Bank", payout: "bank", region: "Asia / Middle East" },
  { id: "Thailand", country: "Thailand", code: "THB", flag: "🇹🇭", method: "PromptPay/Bank", payout: "bank", region: "Asia / Middle East" },
  { id: "UAE", country: "UAE", code: "AED", flag: "🇦🇪", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East" },
  { id: "Saudi Arabia", country: "Saudi Arabia", code: "SAR", flag: "🇸🇦", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East" },
  { id: "Qatar", country: "Qatar", code: "QAR", flag: "🇶🇦", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East" },
  { id: "Kuwait", country: "Kuwait", code: "KWD", flag: "🇰🇼", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East" },
  { id: "Oman", country: "Oman", code: "OMR", flag: "🇴🇲", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East" },
  { id: "Israel", country: "Israel", code: "ILS", flag: "🇮🇱", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East" },
  { id: "Jordan", country: "Jordan", code: "JOD", flag: "🇯🇴", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East" },
  { id: "Lebanon", country: "Lebanon", code: "LBP", flag: "🇱🇧", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East" },
  { id: "Nepal", country: "Nepal", code: "NPR", flag: "🇳🇵", method: "eSewa/Bank", payout: "mobile_money", region: "Asia / Middle East" },
  { id: "Sri Lanka", country: "Sri Lanka", code: "LKR", flag: "🇱🇰", method: "Bank Transfer", payout: "bank", region: "Asia / Middle East" },

  // SOUTH AMERICA / OCEANIA
  { id: "Brazil", country: "Brazil", code: "BRL", flag: "🇧🇷", method: "PIX/Bank", payout: "bank", region: "South America / Oceania", symbol: "R$" },
  { id: "Argentina", country: "Argentina", code: "ARS", flag: "🇦🇷", method: "Bank Transfer", payout: "bank", region: "South America / Oceania" },
  { id: "Colombia", country: "Colombia", code: "COP", flag: "🇨🇴", method: "Bank Transfer", payout: "bank", region: "South America / Oceania" },
  { id: "Peru", country: "Peru", code: "PEN", flag: "🇵🇪", method: "Bank Transfer", payout: "bank", region: "South America / Oceania" },
  { id: "Chile", country: "Chile", code: "CLP", flag: "🇨🇱", method: "Bank Transfer", payout: "bank", region: "South America / Oceania" },
  { id: "Australia", country: "Australia", code: "AUD", flag: "🇦🇺", method: "PayID/Bank", payout: "bank", region: "South America / Oceania", symbol: "A$" },
  { id: "New Zealand", country: "New Zealand", code: "NZD", flag: "🇳🇿", method: "Bank Transfer", payout: "bank", region: "South America / Oceania" },
];

export const POPULAR_COUNTRY_IDS = [
  "Canada", "United States", "United Kingdom", "Nigeria", "Kenya", "Ghana", "India",
];

export const REGION_ORDER: Exclude<CountryRegion, "Popular">[] = [
  "Africa", "North America", "Europe", "Asia / Middle East", "South America / Oceania",
];

export const findCountryById = (id?: string | null): CountryInfo | undefined =>
  id ? COUNTRIES.find((c) => c.id === id) : undefined;

/** Best-effort lookup by currency code (returns first match). Useful for legacy values. */
export const findCountryByCode = (code?: string | null): CountryInfo | undefined =>
  code ? COUNTRIES.find((c) => c.code === code) : undefined;

export const filterCountries = (q: string): CountryInfo[] => {
  const s = q.trim().toLowerCase();
  if (!s) return COUNTRIES;
  return COUNTRIES.filter(
    (c) =>
      c.country.toLowerCase().includes(s) ||
      c.code.toLowerCase().includes(s) ||
      c.method.toLowerCase().includes(s)
  );
};
