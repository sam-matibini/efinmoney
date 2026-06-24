export const FLUTTERWAVE_CURRENCIES = ["NGN", "KES", "UGX", "RWF", "GHS", "TZS"];
export const STRIPE_CURRENCIES = ["USD", "CAD", "EUR", "GBP"];
export const ELICATE_CURRENCIES = ["ZMW"];

export type WalletTopupGateway = "flutterwave" | "stripe" | "elicate" | "unsupported";

export function routeWalletTopupGateway(currency: string): WalletTopupGateway {
  const c = currency.toUpperCase();
  if (ELICATE_CURRENCIES.includes(c)) return "elicate";
  if (FLUTTERWAVE_CURRENCIES.includes(c)) return "flutterwave";
  if (STRIPE_CURRENCIES.includes(c)) return "stripe";
  return "unsupported";
}
