/**
 * Product feature flags — UI visibility only (backend edge functions remain).
 * Override via VITE_FEATURE_<FLAG>=true|false in .env
 */
import { isLivePayinCurrency, isLivePayoutCurrency } from "@/lib/retailPayoutFees";

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = import.meta.env[name];
  if (raw === "true") return true;
  if (raw === "false") return false;
  return defaultValue;
}

export const productFeatures = {
  nombaNigeria: envFlag("VITE_FEATURE_NOMBA_NIGERIA", true),
  ghanaPay: envFlag("VITE_FEATURE_GHANA_PAY", false),
  plaid: envFlag("VITE_FEATURE_PLAID", true),
  canadaDomestic: envFlag("VITE_FEATURE_CANADA_DOMESTIC", true),
  stripe: false,
  /** Company Flutterwave — Africa collect + payout (NGN/GHS/KES/UGX/RWF/TZS/ZMW) + USD/CAD. */
  flutterwave: envFlag("VITE_FEATURE_FLUTTERWAVE", true),
  crypto: envFlag("VITE_FEATURE_CRYPTO", false),
  billPay: envFlag("VITE_FEATURE_BILL_PAY", true),
  paymentLinks: envFlag("VITE_FEATURE_PAYMENT_LINKS", false),
  otherAfricanCorridors: envFlag("VITE_FEATURE_OTHER_AFRICA", false),
  cards: envFlag("VITE_FEATURE_CARDS", true),
  swychr: envFlag("VITE_FEATURE_SWYCHR", true),
  /** Zambia MoMo via Elicate Pay (ZMW top-up + send + payment links). */
  elicate: envFlag("VITE_FEATURE_ELICATE", true),
  /** Paytota invoice top-up for USD/EUR/GBP/CAD + East Africa MoMo (UGX/KES/RWF). */
  paytota: envFlag("VITE_FEATURE_PAYTOTA", true),
  /** Dodo Payments MoR checkout — western wallet top-up (USD/CAD/EUR/GBP). */
  dodo: envFlag("VITE_FEATURE_DODO", true),
  /** ePay cashier gateway — CAD top-up test rail. */
  epay: envFlag("VITE_FEATURE_EPAY", true),
  /** Paytota UGX/KES/RWF MoMo payout toggle on Send. */
  paytotaPayout: envFlag("VITE_FEATURE_PAYTOTA_PAYOUT", true),
  /** Fincra hosted checkout — western + Africa collect (NGN/GHS/KES/…). */
  fincra: envFlag("VITE_FEATURE_FINCRA", true),
  /** Fincra CAD Interac Autodeposit — send checkout + CAD collections. */
  fincraInterac: envFlag("VITE_FEATURE_FINCRA_INTERAC", true),
  /** Flovide (OhentPay) — Africa bank/MoMo. Not used for CAD Interac or CAD payout. */
  flovide: envFlag("VITE_FEATURE_FLOVIDE", true),
  /** Flovide CAD Interac — retired. CAD Interac collect is Fincra Autodeposit. */
  flovideInterac: false,
  /** Wise bank-deposit top-up (shared receive account + unique payment reference). */
  wise: envFlag("VITE_FEATURE_WISE", true),
  /** Square Checkout — card top-up for USD/EUR/GBP (CAD uses Nomba). */
  square: envFlag("VITE_FEATURE_SQUARE", true),
  /** Bambora / Worldline NAM — USD card + Canadian EFT (CAD card collect uses Nomba). */
  bambora: envFlag("VITE_FEATURE_BAMBORA", true),
  /** PayPal Orders API — wallet top-up for USD/CAD/EUR/GBP. */
  paypal: envFlag("VITE_FEATURE_PAYPAL", true),
  /** Lenhub Flutter wrapper — card collect (USD/CAD/…) + FX bank/MoMo payouts. */
  lenhubFlutter: envFlag("VITE_FEATURE_LENHUB_FLUTTER", false),
  adyen: envFlag("VITE_FEATURE_ADYEN", false),
} as const;

export type ProductFeatureKey = keyof typeof productFeatures;

export function isFeatureEnabled(key: ProductFeatureKey): boolean {
  return productFeatures[key];
}

/** Live top-up: Nigeria, Ghana, Kenya, Zambia, Canada, USA. */
export function isLiveTopupCurrency(currency: string): boolean {
  return isLivePayinCurrency(currency);
}

export function isLiveSendCorridor(countryCode: string): boolean {
  return isLivePayoutCurrency(countryCode);
}
