/**
 * Product feature flags — UI visibility only (backend edge functions remain).
 * Override via VITE_FEATURE_<FLAG>=true|false in .env
 */

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = import.meta.env[name];
  if (raw === "true") return true;
  if (raw === "false") return false;
  return defaultValue;
}

export const productFeatures = {
  nombaNigeria: envFlag("VITE_FEATURE_NOMBA_NIGERIA", true),
  ghanaPay: envFlag("VITE_FEATURE_GHANA_PAY", true),
  plaid: envFlag("VITE_FEATURE_PLAID", true),
  canadaDomestic: envFlag("VITE_FEATURE_CANADA_DOMESTIC", false),
  stripe: false,
  flutterwave: envFlag("VITE_FEATURE_FLUTTERWAVE", false),
  crypto: envFlag("VITE_FEATURE_CRYPTO", false),
  billPay: envFlag("VITE_FEATURE_BILL_PAY", false),
  paymentLinks: envFlag("VITE_FEATURE_PAYMENT_LINKS", false),
  otherAfricanCorridors: envFlag("VITE_FEATURE_OTHER_AFRICA", false),
  cards: envFlag("VITE_FEATURE_CARDS", false),
  swychr: envFlag("VITE_FEATURE_SWYCHR", false),
  adyen: envFlag("VITE_FEATURE_ADYEN", false),
} as const;

export type ProductFeatureKey = keyof typeof productFeatures;

export function isFeatureEnabled(key: ProductFeatureKey): boolean {
  return productFeatures[key];
}

/** Live lenhub corridors: Nigeria + Ghana */
export function isLiveTopupCurrency(currency: string): boolean {
  const c = currency.toUpperCase();
  if (productFeatures.nombaNigeria && ["NGN", "USD", "EUR", "GBP", "CAD"].includes(c)) return true;
  if (productFeatures.ghanaPay && c === "GHS") return true;
  if (productFeatures.swychr && ["XAF", "KES", "XOF", "UGX", "USD", "CAD"].includes(c)) return true;
  return false;
}

export function isLiveSendCorridor(countryCode: string): boolean {
  const code = countryCode.toUpperCase();
  if (productFeatures.nombaNigeria && code === "NGN") return true;
  if (productFeatures.ghanaPay && code === "GHS") return true;
  if (productFeatures.otherAfricanCorridors) {
    return ["KES", "UGX", "TZS", "RWF", "ZMW"].includes(code);
  }
  return false;
}
