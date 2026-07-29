import { supabase } from "@/integrations/supabase/client";

const PENDING_TXN_KEY = "efin_swychr_pending_txn";

export interface SwychrCollectionResult {
  success: boolean;
  transaction_id?: string;
  payment_link?: string;
  swychr_transaction_id?: string;
  message?: string;
  error?: string;
}

export const SWYCHR_TOPUP_CURRENCIES = ["XAF", "KES", "XOF", "UGX"];

export function isSwychrTopupCurrency(currency: string): boolean {
  return SWYCHR_TOPUP_CURRENCIES.includes(currency.toUpperCase());
}

export function savePendingSwychrTxn(txnId: string) {
  try { sessionStorage.setItem(PENDING_TXN_KEY, txnId); } catch { /* ignore */ }
}

export function readPendingSwychrTxn(): string | null {
  try { return sessionStorage.getItem(PENDING_TXN_KEY); } catch { return null; }
}

export function clearPendingSwychrTxn() {
  try { sessionStorage.removeItem(PENDING_TXN_KEY); } catch { /* ignore */ }
}

export async function initiateSwychrCollection(params: {
  amount: number;
  target_wallet_id: string;
  email?: string;
  name?: string;
  mobile?: string;
  return_url?: string;
}): Promise<SwychrCollectionResult> {
  const { data, error } = await supabase.functions.invoke("swychr-collection", { body: params });
  const payload = (data ?? {}) as SwychrCollectionResult & { error?: string; message?: string };
  if (payload.error) throw new Error(payload.error);
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = await ctx.json() as { error?: string; message?: string };
        throw new Error(body.error || body.message || error.message);
      } catch (e) {
        if (e instanceof Error && e.message !== error.message) throw e;
      }
    }
    throw new Error(error.message || "Checkout failed");
  }
  if (!payload.success || !payload.payment_link) {
    throw new Error(payload.message || "Checkout link unavailable");
  }
  return payload;
}

export async function getSwychrPayinStatus(swychrTransactionId: string) {
  const { data, error } = await supabase
    .from("swychr_payin_transactions")
    .select("status, amount, currency, failure_reason")
    .eq("transaction_id", swychrTransactionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function verifySwychrPayin(swychrTransactionId: string) {
  const { data, error } = await supabase.functions.invoke("swychr-payin-verify", {
    body: { transaction_id: swychrTransactionId },
  });
  if (error) throw error;
  return data as { verified?: boolean; status?: string };
}
