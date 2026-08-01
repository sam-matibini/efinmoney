import { supabase } from "@/integrations/supabase/client";

export const DODO_TOPUP_CURRENCIES = ["USD", "CAD", "EUR", "GBP"] as const;

export function isDodoTopupCurrency(currency: string): boolean {
  return DODO_TOPUP_CURRENCIES.includes(currency.toUpperCase() as typeof DODO_TOPUP_CURRENCIES[number]);
}

export function dodoMinAmount(currency: string): number {
  void currency;
  return 1;
}

const PENDING_KEY = "efm_dodo_pending_ref";

export function savePendingDodoRef(ref: string) {
  try { sessionStorage.setItem(PENDING_KEY, ref); } catch { /* ignore */ }
}

export function readPendingDodoRef(): string | null {
  try { return sessionStorage.getItem(PENDING_KEY); } catch { return null; }
}

export function clearPendingDodoRef() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}

export function buildDodoTopupRedirectUrl(): string {
  const path = "/wallet/topup";
  const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  const productionBase = (import.meta.env.VITE_APP_URL || "https://www.efin.money").replace(/\/+$/, "");
  if (isLocal || window.location.origin.startsWith("http://")) {
    return `${productionBase}${path}`;
  }
  return `${window.location.origin}${path}`;
}

export async function initiateDodoCheckout(params: {
  walletId: string;
  currency: string;
  amount: number;
  redirectUrl?: string;
}): Promise<{ checkout_url: string; reference: string; session_id?: string }> {
  const { data, error } = await supabase.functions.invoke("dodo-initialize-checkout", {
    body: {
      walletId: params.walletId,
      currency: params.currency,
      amount: params.amount,
      redirectUrl: params.redirectUrl || buildDodoTopupRedirectUrl(),
    },
  });
  if (error) throw new Error(error.message || "Dodo checkout failed");
  if (data?.error) throw new Error(String(data.error));
  if (!data?.checkout_url) throw new Error("No checkout URL returned");
  return {
    checkout_url: String(data.checkout_url),
    reference: String(data.reference || ""),
    session_id: data.session_id ? String(data.session_id) : undefined,
  };
}

export async function verifyDodoPayment(params: {
  reference?: string;
  payment_id?: string;
  session_id?: string;
}): Promise<{ success: boolean; already?: boolean; amount?: number; currency?: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke("dodo-verify-payment", {
    body: params,
  });
  if (error) throw new Error(error.message || "Dodo verify failed");
  return data || { success: false };
}
