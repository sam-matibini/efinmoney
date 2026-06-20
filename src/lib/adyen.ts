import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

async function invokeErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) {
        const hint = body.hint ? ` (${body.hint})` : "";
        const detail = body.detail?.message || body.detail?.errorCode || "";
        return detail ? `${body.error}: ${detail}${hint}` : `${body.error}${hint}`;
      }
    } catch {
      /* ignore parse errors */
    }
  }
  return error instanceof Error ? error.message : "Request failed";
}

export interface AdyenSessionResult {
  sessionId: string;
  sessionData: string;
  clientKey: string;
  environment: string;
  reference: string;
  amount: { value: number; currency: string };
  session_db_id: string;
}

const ADYEN_CONFIG_KEY = "adyen_checkout_config";

export function storeAdyenCheckoutConfig(config: { clientKey: string; environment: string }) {
  try {
    sessionStorage.setItem(ADYEN_CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

export function getStoredAdyenCheckoutConfig(): { clientKey: string; environment: string } | null {
  try {
    const raw = sessionStorage.getItem(ADYEN_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function resolveAdyenClientConfig(): { clientKey: string; environment: string } | null {
  const stored = getStoredAdyenCheckoutConfig();
  const clientKey = stored?.clientKey || import.meta.env.VITE_ADYEN_CLIENT_KEY;
  const environment = stored?.environment || import.meta.env.VITE_ADYEN_ENV || "test";
  if (!clientKey) return null;
  return { clientKey, environment };
}

export async function createAdyenSession(params: {
  amount: number;
  currency: string;
  purpose?: "wallet_topup" | "transfer_funding" | "invoice" | "admin_link";
  target_wallet_id?: string | null;
  target_currency?: string | null;
  return_url?: string;
  related_transfer_id?: string | null;
  related_invoice_id?: string | null;
}): Promise<AdyenSessionResult> {
  const { data, error } = await supabase.functions.invoke("adyen-create-session", { body: params });
  if (error) throw new Error(await invokeErrorMessage(error));
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as AdyenSessionResult;
}

export async function confirmAdyenSession(params: {
  sessionId: string;
  sessionResult?: string | null;
}) {
  const { data, error } = await supabase.functions.invoke("adyen-confirm-session", { body: params });
  if (error) throw new Error(await invokeErrorMessage(error));
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as {
    verified: boolean;
    credited?: boolean;
    already?: boolean;
    credit_error?: string | null;
    amount?: number;
    currency?: string;
    resultCode?: string;
    status?: string;
  };
}

export async function modifyAdyenPayment(params: {
  session_id: string;
  action: "capture" | "cancel" | "refund";
}) {
  const { data, error } = await supabase.functions.invoke("adyen-modify-payment", { body: params });
  if (error) throw new Error(await invokeErrorMessage(error));
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as { action: string; reference: string; adyen: { pspReference: string; status: string } };
}

export async function createAdyenPayLink(params: {
  amount: number;
  currency: string;
  purpose?: "invoice" | "admin_link" | "wallet_topup";
  description?: string;
  sales_invoice_id?: string | null;
  customer_email?: string | null;
  expires_in_hours?: number;
}) {
  const { data, error } = await supabase.functions.invoke("adyen-create-paylink", { body: params });
  if (error) throw new Error(await invokeErrorMessage(error));
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as {
    id: string;
    link_id: string;
    url: string;
    short_url: string;
    expires_at: string;
    amount: { value: number; currency: string };
  };
}
