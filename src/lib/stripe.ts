import { loadStripe, Stripe } from "@stripe/stripe-js";
import { supabase } from "@/integrations/supabase/client";

let stripePromise: Promise<Stripe | null> | null = null;
let lastError: string | null = null;

function isValidPublishableKey(k: unknown): k is string {
  return typeof k === "string" && (k.startsWith("pk_test_") || k.startsWith("pk_live_"));
}

function publishableKeyFromEnv(): string | null {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  return isValidPublishableKey(key) ? key : null;
}

async function fetchKeyFromEdgeFunction(): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("stripe-payment-intent", {
      body: { action: "publishable_key" },
    });
    if (error) {
      lastError = error.message || "Failed to load Stripe key";
      return null;
    }
    if ((data as { error?: string })?.error) {
      lastError = (data as { error: string }).error;
      return null;
    }
    const key = (data as { publishableKey?: string })?.publishableKey;
    if (!isValidPublishableKey(key)) {
      lastError = "Stripe is not configured correctly (invalid publishable key).";
      return null;
    }
    return key;
  } catch (e: unknown) {
    lastError = e instanceof Error ? e.message : "Network error loading Stripe";
    return null;
  }
}

async function fetchKeyDirect(): Promise<string | null> {
  const envKey = publishableKeyFromEnv();
  if (envKey) return envKey;

  const edgeKey = await fetchKeyFromEdgeFunction();
  if (edgeKey) return edgeKey;

  return null;
}

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = (async () => {
      const key = await fetchKeyDirect();
      if (!key) {
        console.error("Stripe publishable key not available:", lastError);
        return null;
      }
      return loadStripe(key);
    })();
  }
  return stripePromise;
}

// A second, independently-loaded Stripe instance. Stripe Elements only allows
// one CardNumberElement per Elements group, so when the page needs to mount
// TWO separate card forms (e.g. sender funding card + recipient debit card for
// Visa Direct), each <Elements> provider must wrap its own Stripe instance.
let stripePromiseSecondary: Promise<Stripe | null> | null = null;
export function getStripeSecondary(): Promise<Stripe | null> {
  if (!stripePromiseSecondary) {
    stripePromiseSecondary = (async () => {
      const key = await fetchKeyDirect();
      if (!key) {
        console.error("Stripe publishable key not available:", lastError);
        return null;
      }
      return loadStripe(key);
    })();
  }
  return stripePromiseSecondary;
}

export function getStripeLoadError(): string | null {
  return lastError;
}
