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
 * Paytota hosted card checkout — used for USD/EUR/GBP/CAD while Nomba international is disabled.
 * NGN stays on Nomba.
 */
export const PAYTOTA_TOPUP_CURRENCIES = ["USD", "EUR", "GBP", "CAD"];
export const AFRICAN_TOPUP_PROVIDER_CURRENCIES = [...FLUTTERWAVE_CURRENCIES];

export type WalletTopupGateway = "flutterwave" | "elicate" | "fincra" | "ghana_pay" | "nomba_pay" | "swychr_pay" | "paytota_pay" | "unsupported";
export type WesternTopupProvider = "flutterwave" | "fincra";
export type AfricanTopupProvider = "flutterwave" | "fincra";

export function supportsWesternProviderChoice(currency: string): boolean {
  const c = currency.toUpperCase();
  if (NOMBA_INTERNATIONAL_CURRENCIES.includes(c)) return false;
  if (PAYTOTA_TOPUP_CURRENCIES.includes(c)) return false;
  return FLW_WESTERN_TOPUP_CURRENCIES.includes(c);
}

export function supportsAfricanProviderChoice(currency: string): boolean {
  const c = currency.toUpperCase();
  if (GHANA_PAY_CURRENCIES.includes(c)) return false;
  if (NOMBA_PAY_CURRENCIES.includes(c)) return false;
  if (PAYTOTA_TOPUP_CURRENCIES.includes(c)) return false;
  if (SWYCHR_TOPUP_CURRENCIES.includes(c)) return false;
  return AFRICAN_TOPUP_PROVIDER_CURRENCIES.includes(c);
}

export function routeWalletTopupGateway(
  currency: string,
  westernProvider?: WesternTopupProvider,
  africanProvider?: AfricanTopupProvider,
  preferSwychr = false,
  preferPaytota = false,
): WalletTopupGateway {
  const c = currency.toUpperCase();
  // Ghana MoMo (Ghana Pay) — Swychr does not offer GHS payin on this account
  if (GHANA_PAY_CURRENCIES.includes(c)) return "ghana_pay";
  // Paytota: international card collect (USD/EUR/GBP/CAD) when enabled
  if (preferPaytota && PAYTOTA_TOPUP_CURRENCIES.includes(c)) return "paytota_pay";
  // Nomba: NGN always; international only when Paytota is off
  if (c === "NGN") return "nomba_pay";
  if (!preferPaytota && NOMBA_PAY_CURRENCIES.includes(c)) return "nomba_pay";
  // Swychr: CM/KE/SN|CI/UG corridors (gated by feature flag via preferSwychr)
  if (preferSwychr && SWYCHR_TOPUP_CURRENCIES.includes(c)) return "swychr_pay";
  if (ELICATE_CURRENCIES.includes(c)) return "elicate";
  if (supportsAfricanProviderChoice(c) && africanProvider === "fincra") return "fincra";
  if (FLUTTERWAVE_CURRENCIES.includes(c) && africanProvider !== "fincra") return "flutterwave";
  if (supportsWesternProviderChoice(c) && westernProvider === "fincra") return "fincra";
  if (supportsWesternProviderChoice(c) && westernProvider === "flutterwave") return "flutterwave";
  return "unsupported";
}

export function paytotaGatewayLabel(_currency: string): string {
  return "Paytota invoice";
}

export function swychrGatewayLabel(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "XAF") return "Cameroon checkout";
  if (c === "KES") return "Kenya checkout";
  if (c === "XOF") return "West Africa checkout";
  if (c === "UGX") return "Uganda checkout";
  return "Mobile money checkout";
}

export function nombaGatewayLabel(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "CAD") return "USD card checkout";
  return NOMBA_INTERNATIONAL_CURRENCIES.includes(c)
    ? "International checkout"
    : "Nigeria checkout";
}
