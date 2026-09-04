import { supabase } from "@/integrations/supabase/client";

export const EPAY_TOPUP_CURRENCIES = ["CAD"] as const;

export function isEpayTopupCurrency(currency: string): boolean {
  return EPAY_TOPUP_CURRENCIES.includes(
    currency.toUpperCase() as (typeof EPAY_TOPUP_CURRENCIES)[number],
  );
}

export function epayMinAmount(_currency: string): number {
  return 1;
}

const PENDING_KEY = "efm_epay_pending_ref";

export function savePendingEpayRef(ref: string) {
  try {
    sessionStorage.setItem(PENDING_KEY, ref);
  } catch { /* ignore */ }
}

export function buildEpayTopupRedirectUrl(): string {
  const path = "/wallet/topup";
  const isLocal = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
  const productionBase = (import.meta.env.VITE_APP_URL || "https://www.efin.money").replace(/\/+$/, "");
  if (isLocal || window.location.origin.startsWith("http://")) {
    return `${productionBase}${path}`;
  }
  return `${window.location.origin}${path}`;
}

export async function initiateEpayCheckout(params: {
  walletId: string;
  currency: string;
  amount: number;
  successUrl?: string;
  failUrl?: string;
}): Promise<{ checkout_url: string; reference: string; epay_order_no?: string }> {
  const redirect = params.successUrl || buildEpayTopupRedirectUrl();
  const { data, error } = await supabase.functions.invoke("epay-collection", {
    body: {
      walletId: params.walletId,
      currency: params.currency,
      amount: params.amount,
      successUrl: redirect,
      failUrl: params.failUrl || redirect,
    },
  });
  if (error) throw new Error(error.message || "ePay checkout failed");
  if (data?.error) throw new Error(String(data.error));
  const url = String(data?.checkout_url || data?.epay_url || "");
  if (!url) throw new Error("No checkout URL returned");
  return {
    checkout_url: url,
    reference: String(data?.reference || data?.merchant_order_no || ""),
    epay_order_no: data?.epay_order_no ? String(data.epay_order_no) : undefined,
  };
}
