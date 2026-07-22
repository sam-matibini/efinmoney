export const FLUTTERWAVE_CURRENCIES = ["NGN", "KES", "UGX", "RWF", "GHS", "TZS"];
export const FLW_WESTERN_TOPUP_CURRENCIES = ["USD", "CAD"];
export const FINCRA_WESTERN_TOPUP_CURRENCIES = ["USD", "CAD"];
export const ELICATE_CURRENCIES = ["ZMW"];
export const GHANA_PAY_CURRENCIES = ["GHS"];
export const NOMBA_NIGERIA_CURRENCIES = ["NGN"];
/** USD/EUR/GBP via Nomba international hosted checkout (lenhub) */
export const NOMBA_INTERNATIONAL_CURRENCIES = ["USD", "EUR", "GBP"];
/** CAD wallet funded via Nomba international USD checkout */
export const NOMBA_CAD_VIA_USD_CURRENCIES = ["CAD"];
/**
 * Swychr Connect payin corridors that work on this merchant account.
 * US/UK/CA/EU stay on Nomba (hosted international checkout).
 */
export const SWYCHR_TOPUP_CURRENCIES = ["XAF", "KES", "XOF", "UGX"];
/** Nomba: NGN + USD/EUR/GBP international + CAD via USD checkout */
export const NOMBA_PAY_CURRENCIES = [...NOMBA_NIGERIA_CURRENCIES, ...NOMBA_INTERNATIONAL_CURRENCIES, ...NOMBA_CAD_VIA_USD_CURRENCIES];
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
/** Fincra hosted checkout corridors. CAD uses USD charge → credit CAD wallet (same pattern as Nomba). */
export const FINCRA_TOPUP_CURRENCIES = ["USD", "EUR", "GBP", "CAD"];
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
/** East Africa currencies that can offer Swychr + Paytota MoMo */
export const AFRICA_MOMO_MULTI_RAIL_CURRENCIES = ["KES", "UGX", "RWF"];
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
export type IntlTopupMethod = "nomba" | "paytota" | "fincra" | "interac" | "lenhub";
/** East Africa MoMo method pick when both Swychr and Paytota are live. */
export type AfricaMomoTopupMethod = "swychr" | "paytota" | "flutterwave";

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
  // Ghana MoMo
  if (GHANA_PAY_CURRENCIES.includes(c)) return "ghana_pay";
  // Explicit Interac (CAD) when user picked that method
  if (preferInterac && c === "CAD") return "fincra_interac";
  // Explicit Fincra hosted checkout
  if (preferFincra && FINCRA_TOPUP_CURRENCIES.includes(c)) return "fincra";
  // Explicit Flutterwave Africa MoMo
  if (preferFlutterwave && FLUTTERWAVE_CURRENCIES.includes(c)) return "flutterwave";
  // Explicit Paytota when user picked invoice / Africa MoMo checkout
  if (preferPaytota && PAYTOTA_TOPUP_CURRENCIES.includes(c)) return "paytota_pay";
  // Explicit Swychr
  if (preferSwychr && SWYCHR_TOPUP_CURRENCIES.includes(c)) return "swychr_pay";
  // Nomba: NGN always; intl/CAD when not on another selected rail
  if (c === "NGN") return "nomba_pay";
  if (NOMBA_PAY_CURRENCIES.includes(c) && !preferPaytota && !preferInterac && !preferFincra && !preferFlutterwave) {
    return "nomba_pay";
  }
  // Default Africa MoMo: Swychr first where available, else Paytota (RWF)
  if (SWYCHR_TOPUP_CURRENCIES.includes(c) && !preferFlutterwave) return "swychr_pay";
  if (PAYTOTA_AFRICA_TOPUP_CURRENCIES.includes(c) && !preferFlutterwave) return "paytota_pay";
  if (ELICATE_CURRENCIES.includes(c)) return "elicate";
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

export function fincraGatewayLabel(_currency: string): string {
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

/** Nomba white-label — distinct from Fincra's "Card or bank transfer". */
export function nombaGatewayLabel(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "CAD") return "Express card";
  if (NOMBA_INTERNATIONAL_CURRENCIES.includes(c)) return "Express card";
  return "Express card";
}

export function intlMethodLabel(method: IntlTopupMethod): string {
  if (method === "paytota") return "Pay by invoice";
  if (method === "interac") return "Interac e-Transfer";
  if (method === "fincra") return "Card or bank transfer";
  if (method === "lenhub") return "Card (direct)";
  return "Express card";
}

export function intlMethodDescription(method: IntlTopupMethod, currency: string): string {
  if (method === "paytota") return "Secure invoice payment for your wallet.";
  if (method === "interac") return "Send CAD from your Canadian bank via Interac.";
  if (method === "lenhub") {
    return `Pay with card in ${currency.toUpperCase()} — PIN/OTP secured.`;
  }
  if (method === "fincra") {
    if (currency.toUpperCase() === "CAD") {
      return "Pay with card in USD — your CAD wallet is credited (Canadian cards welcome).";
    }
    return "Hosted checkout — pay with card or bank transfer where available.";
  }
  if (currency.toUpperCase() === "CAD") {
    return "Fast card payment — pay USD equivalent, credit CAD wallet.";
  }
  return `Fast card payment in ${currency.toUpperCase()}.`;
}

export function africaMomoMethodLabel(method: AfricaMomoTopupMethod): string {
  if (method === "paytota") return "MoMo checkout";
  if (method === "flutterwave") return "Mobile money (alt)";
  return "Mobile money";
}

export function africaMomoMethodDescription(method: AfricaMomoTopupMethod, currency: string): string {
  if (method === "paytota") {
    return `Hosted mobile money payment for your ${currency.toUpperCase()} wallet.`;
  }
  if (method === "flutterwave") {
    return `Alternate mobile money rail for your ${currency.toUpperCase()} wallet.`;
  }
  return `Pay with mobile money to fund your ${currency.toUpperCase()} wallet.`;
}
