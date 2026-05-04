import { loadStripe, Stripe } from "@stripe/stripe-js";

const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe() {
  if (!key) {
    console.warn("VITE_STRIPE_PUBLISHABLE_KEY is not set");
    return Promise.resolve(null);
  }
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}
