import { loadStripe, Stripe } from "@stripe/stripe-js";
import { STRIPE_PAYMENTS_ENABLED, STRIPE_DISABLED_MESSAGE } from "@/lib/stripeDisabled";

let stripePromise: Promise<Stripe | null> | null = null;
let lastError: string | null = STRIPE_DISABLED_MESSAGE;

function isValidPublishableKey(k: unknown): k is string {
  return typeof k === "string" && (k.startsWith("pk_test_") || k.startsWith("pk_live_"));
}

export function getStripe(): Promise<Stripe | null> {
  if (!STRIPE_PAYMENTS_ENABLED) {
    return Promise.resolve(null);
  }
  if (!stripePromise) {
    stripePromise = Promise.resolve(null);
  }
  return stripePromise;
}

let stripePromiseSecondary: Promise<Stripe | null> | null = null;
export function getStripeSecondary(): Promise<Stripe | null> {
  if (!STRIPE_PAYMENTS_ENABLED) {
    return Promise.resolve(null);
  }
  if (!stripePromiseSecondary) {
    stripePromiseSecondary = Promise.resolve(null);
  }
  return stripePromiseSecondary;
}

export function getStripeLoadError(): string | null {
  return lastError;
}
