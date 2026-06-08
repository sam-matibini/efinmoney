import { loadStripe, Stripe } from "@stripe/stripe-js";
import { supabase } from "@/integrations/supabase/client";

let stripePromise: Promise<Stripe | null> | null = null;
let lastError: string | null = null;

function isValidPublishableKey(k: unknown): k is string {
  return typeof k === "string" && (k.startsWith("pk_test_") || k.startsWith("pk_live_"));
}

async function fetchKeyDirect(): Promise<string | null> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-payment-intent?action=publishable_key`;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      lastError = j?.error || `Failed to load Stripe key (${res.status})`;
      return null;
    }
    if (!isValidPublishableKey(j?.publishableKey)) {
      lastError = "Stripe is not configured correctly (invalid publishable key).";
      return null;
    }
    return j.publishableKey as string;
  } catch (e: any) {
    lastError = e?.message || "Network error loading Stripe";
    return null;
  }
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
