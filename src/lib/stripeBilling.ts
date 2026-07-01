/** ISO country for Stripe billing_details.address.country, matched to wallet currency. */
export function billingCountryForWalletCurrency(currency: string): string {
  switch (currency.toUpperCase()) {
    case "USD":
      return "US";
    case "CAD":
      return "CA";
    case "GBP":
      return "GB";
    case "EUR":
      return "DE";
    default:
      return "US";
  }
}

export function isStripeTestMode(): boolean {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  return typeof key === "string" && key.startsWith("pk_test_");
}

export function formatStripePaymentError(error: {
  message?: string;
  code?: string;
  decline_code?: string;
  type?: string;
  payment_intent?: { last_payment_error?: { message?: string; code?: string; decline_code?: string } };
} | null | undefined): string {
  if (!error) return "Payment failed";
  const nested = error.payment_intent?.last_payment_error;
  if (nested?.message && nested.message !== error.message) {
    return formatStripePaymentError(nested);
  }
  const parts: string[] = [];
  if (error.decline_code) parts.push(`decline: ${error.decline_code}`);
  if (error.code && error.code !== error.decline_code) parts.push(`code: ${error.code}`);
  const base = error.message || "Payment failed";
  return parts.length ? `${base} (${parts.join(" · ")})` : base;
}

export const STRIPE_TEST_CARD_HINT =
  "Stripe test mode: use card 4242 4242 4242 4242, any future expiry, any CVC. Real cards do not work in test mode.";

export const STRIPE_VIRTUAL_CARD_HINT =
  "US virtual cards (Grey, Wise, etc.): use the billing address on file with your card issuer. If the inline form keeps failing, try Pay with Stripe Checkout below — it handles bank verification (3DS) more reliably.";
