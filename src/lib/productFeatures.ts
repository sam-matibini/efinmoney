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
  /** Paytota UGX/KES/RWF MoMo payout toggle on Send. */
  paytotaPayout: envFlag("VITE_FEATURE_PAYTOTA_PAYOUT", true),
  /** Fincra hosted checkout — western + Africa collect (NGN/GHS/KES/…). */
  fincra: envFlag("VITE_FEATURE_FINCRA", true),
  /** Fincra CAD Interac e-Transfer collections (platform alias + intent matching). */
  fincraInterac: envFlag("VITE_FEATURE_FINCRA_INTERAC", false),
  /** Lenhub Flutter wrapper — card collect (USD/CAD/…) + FX bank/MoMo payouts. */
  lenhubFlutter: envFlag("VITE_FEATURE_LENHUB_FLUTTER", true),
  adyen: envFlag("VITE_FEATURE_ADYEN", false),
} as const;

export type ProductFeatureKey = keyof typeof productFeatures;

export function isFeatureEnabled(key: ProductFeatureKey): boolean {
  return productFeatures[key];
}

/** Live top-up corridors — Nomba NGN + Paytota/Nomba intl + Swychr + Ghana Pay + Elicate ZMW + Fincra Africa */
export function isLiveTopupCurrency(currency: string): boolean {
  const c = currency.toUpperCase();
  if (productFeatures.nombaNigeria && c === "NGN") return true;
  if ((productFeatures.paytota || productFeatures.nombaNigeria || productFeatures.fincra || productFeatures.lenhubFlutter || productFeatures.dodo) && ["USD", "EUR", "GBP", "CAD"].includes(c)) {
    return true;
  }
  if (productFeatures.lenhubFlutter && ["NGN", "GHS", "KES", "UGX", "RWF", "TZS"].includes(c)) return true;
  if (productFeatures.fincra && ["NGN", "GHS", "KES", "UGX", "TZS", "ZMW", "ZAR", "XAF", "XOF", "MWK"].includes(c)) {
    return true;
  }
  if (productFeatures.fincraInterac && c === "CAD") return true;
  if (productFeatures.swychr && ["XAF", "KES", "XOF", "UGX"].includes(c)) return true;
  if (productFeatures.paytota && ["UGX", "KES", "RWF"].includes(c)) return true;
  if (productFeatures.ghanaPay && c === "GHS") return true;
  if (productFeatures.elicate && c === "ZMW") return true;
  // Company Flutterwave Africa + western card top-up
  if (productFeatures.flutterwave && ["NGN", "GHS", "KES", "UGX", "RWF", "TZS", "ZMW", "USD", "CAD"].includes(c)) {
    return true;
  }
  return false;
}

export function isLiveSendCorridor(countryCode: string): boolean {
  const code = countryCode.toUpperCase();
  if (productFeatures.nombaNigeria && (code === "NGN" || code === "NG")) return true;
  if (productFeatures.lenhubFlutter && ["NG", "NGN", "GH", "GHS", "KE", "KES", "UG", "UGX", "TZ", "TZS", "RW", "RWF", "ZM", "ZMW"].includes(code)) {
    return true;
  }
  if (productFeatures.ghanaPay && (code === "GHS" || code === "GH")) return true;
  if (productFeatures.elicate && (code === "ZMW" || code === "ZM")) return true;
  if (productFeatures.paytotaPayout && ["UGX", "UG", "KES", "KE", "RWF", "RW"].includes(code)) {
    return true;
  }
  if (
    productFeatures.flutterwave &&
    ["NGN", "NG", "GHS", "GH", "KES", "KE", "UGX", "UG", "RWF", "RW", "TZS", "TZ", "ZMW", "ZM"].includes(code)
  ) {
    return true;
  }
  if (productFeatures.otherAfricanCorridors) {
    return ["KES", "UGX", "TZS", "RWF", "ZMW", "KE", "UG", "TZ", "RW", "ZM"].includes(code);
  }
  return false;
}
