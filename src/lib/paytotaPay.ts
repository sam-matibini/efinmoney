import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const PENDING_TXN_KEY = "efin_paytota_pending_txn";

export const PAYTOTA_TOPUP_CURRENCIES = ["USD", "EUR", "GBP", "CAD"] as const;

async function invokeErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) return String(body.error);
    } catch {
      /* ignore */
    }
  }
  return error instanceof Error ? error.message : "Request failed";
}

export interface PaytotaCollectionResult {
  success: boolean;
  transaction_id: string;
  purchase_id?: string;
  payment_link: string;
  message: string;
}

export interface PaytotaPayStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  amount: number;
  currency: string;
  credit_amount: number | null;
  credit_currency: string | null;
  failure_reason: string | null;
  purchase_id: string | null;
}

export function isPaytotaTopupCurrency(currency: string): boolean {
  return PAYTOTA_TOPUP_CURRENCIES.includes(
    currency.toUpperCase() as (typeof PAYTOTA_TOPUP_CURRENCIES)[number],
  );
}

export function isPaytotaCadViaUsdCurrency(_currency: string): boolean {
  return false;
}

export function paytotaMinAmount(_currency: string): number {
  return 1;
}

export function savePendingPaytotaTxn(txnId: string) {
  try {
    sessionStorage.setItem(PENDING_TXN_KEY, txnId);
  } catch {
    /* ignore */
  }
}

export function readPendingPaytotaTxn(): string | null {
  try {
    return sessionStorage.getItem(PENDING_TXN_KEY);
  } catch {
    return null;
  }
}

export function clearPendingPaytotaTxn() {
  try {
    sessionStorage.removeItem(PENDING_TXN_KEY);
  } catch {
    /* ignore */
  }
}

export async function initiatePaytotaCollection(params: {
  amount: number;
  credit_amount?: number;
  target_wallet_id: string;
  email?: string;
  return_url?: string;
}): Promise<PaytotaCollectionResult & { quote?: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke("paytota-collection", { body: params });
  if (error) throw new Error(await invokeErrorMessage(error));
  const payload = data as PaytotaCollectionResult & {
    error?: string;
    quote?: Record<string, unknown>;
  };
  if (!payload?.success || !payload.payment_link) {
    throw new Error(payload?.error || payload?.message || "Could not start checkout");
  }
  return payload;
}

export async function getPaytotaPayStatus(txnId: string): Promise<PaytotaPayStatus | null> {
  const { data } = await (supabase as any)
    .from("paytota_payin_transactions")
    .select("id, status, amount, currency, credit_amount, credit_currency, failure_reason, purchase_id")
    .eq("id", txnId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    amount: Number(data.amount),
    currency: data.currency,
    credit_amount: data.credit_amount != null ? Number(data.credit_amount) : null,
    credit_currency: data.credit_currency,
    failure_reason: data.failure_reason,
    purchase_id: data.purchase_id,
  };
}

/** Confirm payment with provider after browser return (covers delayed webhooks). */
export async function confirmPaytotaPayment(params: {
  transaction_id?: string;
  purchase_id?: string;
}): Promise<{ ok: boolean; status: string; credit_amount?: number; credit_currency?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("paytota-webhook", { body: params });
  if (error) throw new Error(await invokeErrorMessage(error));
  return data as {
    ok: boolean;
    status: string;
    credit_amount?: number;
    credit_currency?: string;
    error?: string;
  };
}
