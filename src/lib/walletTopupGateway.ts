export const FLUTTERWAVE_CURRENCIES = ["NGN", "KES", "UGX", "RWF", "GHS", "TZS"];
export const STRIPE_CURRENCIES = ["USD", "CAD", "EUR", "GBP"];
/** USD/CAD can be topped up via Stripe or Flutterwave hosted checkout */
export const FLW_WESTERN_TOPUP_CURRENCIES = ["USD", "CAD"];
export const ELICATE_CURRENCIES = ["ZMW"];

export type WalletTopupGateway = "flutterwave" | "stripe" | "elicate" | "unsupported";
export type WesternTopupProvider = "stripe" | "flutterwave";

export function supportsWesternProviderChoice(currency: string): boolean {
  return FLW_WESTERN_TOPUP_CURRENCIES.includes(currency.toUpperCase());
}

export function routeWalletTopupGateway(
  currency: string,
  westernProvider?: WesternTopupProvider,
): WalletTopupGateway {
  const c = currency.toUpperCase();
  if (ELICATE_CURRENCIES.includes(c)) return "elicate";
  if (FLUTTERWAVE_CURRENCIES.includes(c)) return "flutterwave";
  if (supportsWesternProviderChoice(c) && westernProvider === "flutterwave") return "flutterwave";
  if (STRIPE_CURRENCIES.includes(c)) return "stripe";
  return "unsupported";
}
