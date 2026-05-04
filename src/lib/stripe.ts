import { loadStripe, Stripe } from "@stripe/stripe-js";
import { supabase } from "@/integrations/supabase/client";

let stripePromise: Promise<Stripe | null> | null = null;

async function fetchPublishableKey(): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke("stripe-payment-intent", {
    method: "GET",
    body: undefined as any,
    // Pass action via query string is not supported by invoke; use fetch directly
  });
  if (!error && data?.publishableKey) return data.publishableKey as string;
  return null;
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
    if (!res.ok) return null;
    const j = await res.json();
    return j.publishableKey ?? null;
  } catch {
    return null;
  }
}

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = (async () => {
      const key = await fetchKeyDirect();
      if (!key) {
        console.error("Stripe publishable key not available");
        return null;
      }
      return loadStripe(key);
    })();
  }
  return stripePromise;
}
