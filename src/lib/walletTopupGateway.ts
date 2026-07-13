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
export const NOMBA_PAY_CURRENCIES = [...NOMBA_NIGERIA_CURRENCIES, ...NOMBA_INTERNATIONAL_CURRENCIES, ...NOMBA_CAD_VIA_USD_CURRENCIES];
export const AFRICAN_TOPUP_PROVIDER_CURRENCIES = [...FLUTTERWAVE_CURRENCIES];

export type WalletTopupGateway = "flutterwave" | "elicate" | "fincra" | "ghana_pay" | "nomba_pay" | "unsupported";
export type WesternTopupProvider = "flutterwave" | "fincra";
export type AfricanTopupProvider = "flutterwave" | "fincra";

export function supportsWesternProviderChoice(currency: string): boolean {
  const c = currency.toUpperCase();
  if (NOMBA_INTERNATIONAL_CURRENCIES.includes(c)) return false;
  return FLW_WESTERN_TOPUP_CURRENCIES.includes(c);
}

export function supportsAfricanProviderChoice(currency: string): boolean {
  const c = currency.toUpperCase();
  if (GHANA_PAY_CURRENCIES.includes(c)) return false;
  if (NOMBA_PAY_CURRENCIES.includes(c)) return false;
  return AFRICAN_TOPUP_PROVIDER_CURRENCIES.includes(c);
}

export function routeWalletTopupGateway(
  currency: string,
  westernProvider?: WesternTopupProvider,
  africanProvider?: AfricanTopupProvider,
): WalletTopupGateway {
  const c = currency.toUpperCase();
  if (GHANA_PAY_CURRENCIES.includes(c)) return "ghana_pay";
  if (NOMBA_PAY_CURRENCIES.includes(c)) return "nomba_pay";
  if (ELICATE_CURRENCIES.includes(c)) return "elicate";
  if (supportsAfricanProviderChoice(c) && africanProvider === "fincra") return "fincra";
  if (FLUTTERWAVE_CURRENCIES.includes(c) && africanProvider !== "fincra") return "flutterwave";
  if (supportsWesternProviderChoice(c) && westernProvider === "fincra") return "fincra";
  if (supportsWesternProviderChoice(c) && westernProvider === "flutterwave") return "flutterwave";
  return "unsupported";
}

export function nombaGatewayLabel(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "CAD") return "USD card checkout";
  return NOMBA_INTERNATIONAL_CURRENCIES.includes(c)
    ? "International checkout"
    : "Nigeria checkout";
}
