/** Company Flutterwave Africa collect corridors (card / MoMo / bank where supported). */
export const FLUTTERWAVE_CURRENCIES = ["NGN", "KES", "UGX", "RWF", "GHS", "TZS", "ZMW"];
/** Same set — used by Africa MoMo multi-rail picker. */
export const FLW_AFRICA_TOPUP_CURRENCIES = [...FLUTTERWAVE_CURRENCIES];
export const FLW_WESTERN_TOPUP_CURRENCIES = ["USD", "CAD"];
export const FINCRA_WESTERN_TOPUP_CURRENCIES = ["USD", "CAD"];
export const ELICATE_CURRENCIES = ["ZMW"];
export const GHANA_PAY_CURRENCIES = ["GHS"];
export const NOMBA_NIGERIA_CURRENCIES = ["NGN"];
/** USD/EUR/GBP via Nomba international hosted checkout (lenhub) — Coming soon until provider returns checkout links. */
export const NOMBA_INTERNATIONAL_CURRENCIES = ["USD", "EUR", "GBP"];
/** CAD wallet funded via Nomba international USD checkout — Coming soon with international. */
export const NOMBA_CAD_VIA_USD_CURRENCIES = ["CAD"];
/**
 * Swychr Connect payin corridors that work on this merchant account.
 * US/UK/CA/EU stay on Nomba (hosted international checkout).
 */
export const SWYCHR_TOPUP_CURRENCIES = ["XAF", "KES", "XOF", "UGX"];
/** All Nomba pay-in currencies (including Coming soon international). */
export const NOMBA_PAY_CURRENCIES = [...NOMBA_NIGERIA_CURRENCIES, ...NOMBA_INTERNATIONAL_CURRENCIES, ...NOMBA_CAD_VIA_USD_CURRENCIES];

/** Live Nomba collect today — NGN only (intl checkout returns empty links). */
export function isNombaTopupLive(currency: string): boolean {
  return NOMBA_NIGERIA_CURRENCIES.includes(currency.toUpperCase());
}

/** Show Express card for these wallets but greyed as Coming soon. */
export function isNombaTopupComingSoon(currency: string): boolean {
  const c = currency.toUpperCase();
  return NOMBA_INTERNATIONAL_CURRENCIES.includes(c) || NOMBA_CAD_VIA_USD_CURRENCIES.includes(c);
}
/**
 * Paytota hosted invoice — USD/EUR/GBP/CAD.
 * East Africa MoMo — UGX/KES/RWF (multi-rail alongside Swychr where both apply).
 * NGN stays on Nomba.
 */
export const PAYTOTA_WESTERN_TOPUP_CURRENCIES = ["USD", "EUR", "GBP", "CAD"];
export const PAYTOTA_AFRICA_TOPUP_CURRENCIES = ["UGX", "KES", "RWF"];
export const PAYTOTA_TOPUP_CURRENCIES = [
  ...PAYTOTA_WESTERN_TOPUP_CURRENCIES,
  ...PAYTOTA_AFRICA_TOPUP_CURRENCIES,
];
/** Fincra western hosted checkout. CAD uses USD charge → credit CAD wallet. */
export const FINCRA_WESTERN_CHECKOUT_CURRENCIES = ["USD", "EUR", "GBP", "CAD"];
/**
 * African collect currencies confirmed on this Fincra merchant (checkout create OK).
 * RWF is not accepted by Fincra checkout.
 */
export const FINCRA_AFRICA_TOPUP_CURRENCIES = [
  "NGN",
  "GHS",
  "KES",
  "UGX",
  "TZS",
  "ZMW",
  "ZAR",
  "XAF",
  "XOF",
  "MWK",
];
/** All Fincra top-up corridors (western + Africa). */
export const FINCRA_TOPUP_CURRENCIES = [
  ...FINCRA_WESTERN_CHECKOUT_CURRENCIES,
  ...FINCRA_AFRICA_TOPUP_CURRENCIES,
];
/** Lenhub Flutter card collect currencies (flutter.json card create). */
export const LENHUB_FLUTTER_TOPUP_CURRENCIES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "NGN",
  "GHS",
  "KES",
  "UGX",
  "RWF",
  "TZS",
];
/** Currencies that can offer multiple western/intl rails for the user to pick */
export const MULTI_RAIL_TOPUP_CURRENCIES = ["USD", "EUR", "GBP", "CAD"];
/**
 * African wallets that can offer multiple top-up rails (primary MoMo + Fincra, etc.).
 */
export const AFRICA_MOMO_MULTI_RAIL_CURRENCIES = [
  "KES",
  "UGX",
  "RWF",
  "GHS",
  "TZS",
  "ZMW",
  "XAF",
  "XOF",
  "ZAR",
  "MWK",
];
export const AFRICAN_TOPUP_PROVIDER_CURRENCIES = [...FLUTTERWAVE_CURRENCIES];

export type WalletTopupGateway =
  | "flutterwave"
  | "elicate"
  | "fincra"
  | "fincra_interac"
  | "ghana_pay"
  | "nomba_pay"
  | "swychr_pay"
  | "paytota_pay"
  | "lenhub_flutter"
  | "unsupported";

export type WesternTopupProvider = "flutterwave" | "fincra";
export type AfricanTopupProvider = "flutterwave" | "fincra";
/** User-facing intl/CAD method pick (internal keys; UI uses white-label labels). */
export type IntlTopupMethod = "nomba" | "paytota" | "fincra" | "interac" | "lenhub" | "flutterwave";
/** African multi-rail method pick. */
export type AfricaMomoTopupMethod =
  | "swychr"
  | "paytota"
  | "flutterwave"
  | "fincra"
  | "ghana"
  | "elicate"
  | "lenhub";

export function isFincraTopupCurrency(currency: string): boolean {
  return FINCRA_TOPUP_CURRENCIES.includes(currency.toUpperCase());
}

export function supportsWesternProviderChoice(currency: string): boolean {
  const c = currency.toUpperCase();
  if (NOMBA_INTERNATIONAL_CURRENCIES.includes(c)) return false;
  if (PAYTOTA_WESTERN_TOPUP_CURRENCIES.includes(c)) return false;
  if (FINCRA_TOPUP_CURRENCIES.includes(c)) return false;
  return FLW_WESTERN_TOPUP_CURRENCIES.includes(c);
}

export function supportsAfricanProviderChoice(currency: string): boolean {
  const c = currency.toUpperCase();
  if (GHANA_PAY_CURRENCIES.includes(c)) return false;
  if (NOMBA_PAY_CURRENCIES.includes(c)) return false;
  if (PAYTOTA_AFRICA_TOPUP_CURRENCIES.includes(c)) return false;
  if (SWYCHR_TOPUP_CURRENCIES.includes(c)) return false;
  return AFRICAN_TOPUP_PROVIDER_CURRENCIES.includes(c);
}

export function routeWalletTopupGateway(
  currency: string,
  westernProvider?: WesternTopupProvider,
  africanProvider?: AfricanTopupProvider,
  preferSwychr = false,
  preferPaytota = false,
  preferInterac = false,
  preferFincra = false,
  preferFlutterwave = false,
  preferLenhubFlutter = false,
): WalletTopupGateway {
  const c = currency.toUpperCase();
  // Explicit Lenhub Flutter card rail
  if (preferLenhubFlutter && LENHUB_FLUTTER_TOPUP_CURRENCIES.includes(c)) return "lenhub_flutter";
  // Explicit Interac (CAD) when user picked that method
  if (preferInterac && c === "CAD") return "fincra_interac";
  // Explicit Fincra hosted checkout (NGN + Africa + western) — before dedicated primary rails
  if (preferFincra && isFincraTopupCurrency(c)) return "fincra";
  // Explicit company Flutterwave — before Ghana/Nomba/Elicate defaults
  if (
    preferFlutterwave &&
    (FLUTTERWAVE_CURRENCIES.includes(c) || FLW_WESTERN_TOPUP_CURRENCIES.includes(c))
  ) {
    return "flutterwave";
  }
  // Explicit Paytota when user picked invoice / Africa MoMo checkout
  if (preferPaytota && PAYTOTA_TOPUP_CURRENCIES.includes(c)) return "paytota_pay";
  // Explicit Swychr
  if (preferSwychr && SWYCHR_TOPUP_CURRENCIES.includes(c)) return "swychr_pay";
  // Ghana MoMo (default GHS rail unless another rail selected above)
  if (GHANA_PAY_CURRENCIES.includes(c)) return "ghana_pay";
  // Nomba: live for NGN only (western Express card is Coming soon — empty intl checkout links)
  if (c === "NGN") return "nomba_pay";
  if (
    isNombaTopupLive(c) &&
    !preferPaytota &&
    !preferInterac &&
    !preferFincra &&
    !preferFlutterwave &&
    !preferLenhubFlutter
  ) {
    return "nomba_pay";
  }
  // Default East Africa MoMo → Paytota (UGX/KES/RWF); Swychr for XAF/XOF (and when explicitly picked)
  if (PAYTOTA_AFRICA_TOPUP_CURRENCIES.includes(c) && !preferFlutterwave && !preferFincra && !preferSwychr) {
    return "paytota_pay";
  }
  if (SWYCHR_TOPUP_CURRENCIES.includes(c) && !preferFlutterwave && !preferFincra) return "swychr_pay";
  if (ELICATE_CURRENCIES.includes(c) && !preferFincra && !preferFlutterwave) return "elicate";
  // Sole Fincra Africa corridors (no other primary live rail on this build)
  if (["ZAR", "MWK"].includes(c) && isFincraTopupCurrency(c)) return "fincra";
  if (supportsAfricanProviderChoice(c) && africanProvider === "fincra") return "fincra";
  if (FLUTTERWAVE_CURRENCIES.includes(c) && africanProvider !== "fincra") return "flutterwave";
  if (supportsWesternProviderChoice(c) && westernProvider === "fincra") return "fincra";
  if (supportsWesternProviderChoice(c) && westernProvider === "flutterwave") return "flutterwave";
  return "unsupported";
}

/** White-label labels — never expose PSP vendor names in user UI. */
export function paytotaGatewayLabel(currency: string): string {
  const c = currency.toUpperCase();
  if (PAYTOTA_AFRICA_TOPUP_CURRENCIES.includes(c)) return "MoMo checkout";
  return "Pay by invoice";
}

export function fincraGatewayLabel(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "NGN") return "Card or bank transfer";
  if (["GHS", "ZMW"].includes(c)) return "Card or mobile money";
  if (["KES", "UGX", "TZS", "XAF", "XOF", "MWK"].includes(c)) return "Mobile money";
  if (c === "ZAR") return "Card checkout";
  return "Card or bank transfer";
}

export function swychrGatewayLabel(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "XAF") return "Mobile money";
  if (c === "KES") return "Mobile money";
  if (c === "XOF") return "Mobile money";
  if (c === "UGX") return "Mobile money";
  return "Mobile money";
}

/** Distinct from Fincra's "Card or bank transfer". */
export function nombaGatewayLabel(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "CAD") return "Express card";
  if (NOMBA_INTERNATIONAL_CURRENCIES.includes(c)) return "Express card";
  return "Express card";
}

/** Short benefit tag for the method picker (never a vendor name). */
export function intlMethodBenefit(method: IntlTopupMethod): string {
  if (method === "paytota") return "Invoice";
  if (method === "interac") return "Bank send";
  if (method === "fincra") return "Flexible";
  if (method === "lenhub") return "In-app";
  if (method === "flutterwave") return "Hosted";
  return "Fast";
}

export function africaMomoMethodBenefit(method: AfricaMomoTopupMethod): string {
  if (method === "paytota") return "Hosted";
  if (method === "flutterwave") return "Company";
  if (method === "fincra") return "Flexible";
  if (method === "ghana") return "Direct";
  if (method === "elicate") return "Direct";
  if (method === "lenhub") return "In-app";
  return "MoMo";
}

/** Processor name for staff/ops UI only — never show to customers. */
export function intlMethodProvider(method: IntlTopupMethod): string {
  if (method === "paytota") return "Paytota";
  if (method === "interac") return "Interac";
  if (method === "fincra") return "Fincra";
  if (method === "lenhub") return "Lenhub";
  if (method === "flutterwave") return "Flutterwave";
  return "Nomba";
}

export function africaMomoMethodProvider(method: AfricaMomoTopupMethod): string {
  if (method === "paytota") return "Paytota";
  if (method === "flutterwave") return "Flutterwave";
  if (method === "fincra") return "Fincra";
  if (method === "ghana") return "Ghana Pay";
  if (method === "elicate") return "Elicate";
  if (method === "lenhub") return "Lenhub";
  return "Swychr";
}

export function gatewayProviderLabel(gateway: WalletTopupGateway): string | null {
  if (gateway === "swychr_pay") return "Swychr";
  if (gateway === "paytota_pay") return "Paytota";
  if (gateway === "nomba_pay") return "Nomba";
  if (gateway === "lenhub_flutter") return "Lenhub";
  if (gateway === "ghana_pay") return "Ghana Pay";
  if (gateway === "elicate") return "Elicate";
  if (gateway === "fincra_interac") return "Interac";
  if (gateway === "fincra") return "Fincra";
  if (gateway === "flutterwave") return "Flutterwave";
  return null;
}

export function intlMethodLabel(method: IntlTopupMethod, currency?: string): string {
  if (method === "paytota") return "Pay by invoice";
  if (method === "interac") return "Interac e-Transfer";
  if (method === "fincra") return fincraGatewayLabel(currency || "");
  if (method === "lenhub") {
    return currency?.toUpperCase() === "NGN" ? "NGN card or bank" : "Card (direct)";
  }
  if (method === "flutterwave") {
    if (currency?.toUpperCase() === "NGN") return "Card, bank or USSD";
    return "Card checkout";
  }
  return "Express card";
}

export function intlMethodDescription(method: IntlTopupMethod, currency: string): string {
  const c = currency.toUpperCase();
  if (method === "paytota") {
    return `Pay from a secure invoice link — your ${c} wallet credits after confirmation.`;
  }
  if (method === "interac") {
    return "Send CAD from your Canadian bank with Interac e-Transfer.";
  }
  if (method === "lenhub") {
    if (c === "NGN") {
      return "Enter your Naira card or get a virtual account — PIN/OTP stays in the app.";
    }
    return `Enter your card in the app — PIN/OTP secured for ${c}.`;
  }
  if (method === "flutterwave") {
    if (c === "CAD") {
      return "Complete card payment on a secure page — CAD wallet credits after confirmation.";
    }
    if (c === "USD") {
      return "Complete card payment on a secure page — USD wallet credits after confirmation.";
    }
    if (c === "NGN") {
      return "Pay with Naira card, bank transfer, or USSD on a secure company checkout page.";
    }
    return `Complete card payment on a secure page for your ${c} wallet.`;
  }
  if (method === "fincra") {
    if (c === "CAD") {
      return "Pay with card in USD on a secure page — your CAD wallet is credited after confirmation.";
    }
    if (c === "NGN") {
      return "Pay with a Naira card or bank transfer on a secure page.";
    }
    if (["KES", "UGX", "TZS", "XAF", "XOF", "MWK"].includes(c)) {
      return `Pay with mobile money on a secure page for your ${c} wallet.`;
    }
    if (["GHS", "ZMW"].includes(c)) {
      return `Pay with card or mobile money on a secure page for your ${c} wallet.`;
    }
    return `Pay with card or bank transfer on a secure page for ${c}.`;
  }
  if (c === "CAD") {
    return "Quick card payment — pay the USD equivalent, CAD wallet credits after confirmation.";
  }
  return `Quick card payment for your ${c} wallet — opens a secure page to finish.`;
}

export function africaMomoMethodLabel(method: AfricaMomoTopupMethod): string {
  if (method === "paytota") return "MoMo checkout";
  if (method === "flutterwave") return "Card / mobile money";
  if (method === "fincra") return "Checkout (alt)";
  if (method === "ghana") return "Mobile money";
  if (method === "elicate") return "Mobile money";
  if (method === "lenhub") return "Card (direct)";
  return "Mobile money";
}

export function africaMomoMethodDescription(method: AfricaMomoTopupMethod, currency: string): string {
  const c = currency.toUpperCase();
  if (method === "paytota") {
    return `Hosted mobile money payment for your ${c} wallet.`;
  }
  if (method === "flutterwave") {
    return `Company checkout — card and/or mobile money for your ${c} wallet.`;
  }
  if (method === "fincra") {
    return intlMethodDescription("fincra", c);
  }
  if (method === "ghana") {
    return `Pay with Ghana mobile money to fund your ${c} wallet.`;
  }
  if (method === "elicate") {
    return `Pay with Zambia mobile money to fund your ${c} wallet.`;
  }
  if (method === "lenhub") {
    return `Enter your card in the app — PIN/OTP secured for ${c}.`;
  }
  return `Pay with mobile money to fund your ${c} wallet.`;
}
