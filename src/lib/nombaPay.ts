import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const PENDING_TXN_KEY = "efin_nomba_pending_txn";

export const NOMBA_NIGERIA_CURRENCIES = ["NGN"] as const;
export const NOMBA_INTERNATIONAL_CURRENCIES = ["USD", "EUR", "GBP"] as const;
export const NOMBA_PAY_CURRENCIES = [
  ...NOMBA_NIGERIA_CURRENCIES,
  ...NOMBA_INTERNATIONAL_CURRENCIES,
  "CAD",
] as const;

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

export interface NombaCollectionResult {
  success: boolean;
  transaction_id: string;
  order_id?: string;
  payment_link: string;
  message: string;
}

export interface NombaPayStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  amount: number;
  currency: string;
  credit_amount: number | null;
  credit_currency: string | null;
  failure_reason: string | null;
  order_id: string | null;
}

export function isNombaNigeriaCurrency(currency: string): boolean {
  return NOMBA_NIGERIA_CURRENCIES.includes(currency.toUpperCase() as typeof NOMBA_NIGERIA_CURRENCIES[number]);
}

export function isNombaInternationalCurrency(currency: string): boolean {
  return NOMBA_INTERNATIONAL_CURRENCIES.includes(currency.toUpperCase() as typeof NOMBA_INTERNATIONAL_CURRENCIES[number]);
}

export function isNombaCadViaUsdCurrency(currency: string): boolean {
  return currency.toUpperCase() === "CAD";
}

export function isNombaTopupCurrency(currency: string): boolean {
  const c = currency.toUpperCase();
  return isNombaNigeriaCurrency(c) || isNombaInternationalCurrency(c) || isNombaCadViaUsdCurrency(c);
}

export function nombaMinAmount(currency: string): number {
  const c = currency.toUpperCase();
  if (c === "NGN") return 100;
  // CAD is charged in USD after fees — keep headroom so checkout clears ~$2
  if (c === "CAD") return 5;
  return 2;
}

export function savePendingNombaTxn(txnId: string) {
  try {
    sessionStorage.setItem(PENDING_TXN_KEY, txnId);
  } catch {
    /* ignore */
  }
}

export function readPendingNombaTxn(): string | null {
  try {
    return sessionStorage.getItem(PENDING_TXN_KEY);
  } catch {
    return null;
  }
}

export function clearPendingNombaTxn() {
  try {
    sessionStorage.removeItem(PENDING_TXN_KEY);
  } catch {
    /* ignore */
  }
}

export async function initiateNombaCollection(params: {
  amount: number;
  credit_amount?: number;
  target_wallet_id: string;
  email?: string;
  corridor?: "nigeria" | "international";
  return_url?: string;
}): Promise<NombaCollectionResult & { quote?: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke("nomba-collection", { body: params });
  if (error) throw new Error(await invokeErrorMessage(error));
  const payload = data as NombaCollectionResult & {
    error?: string;
    message?: string;
    provider_response?: Record<string, unknown>;
    code?: string;
  };
  if (payload.error) {
    const providerMsg = String(
      payload.provider_response?.message
      ?? (payload.provider_response as { Data?: { message?: string } })?.Data?.message
      ?? "",
    ).trim();
    const data = (payload.provider_response as { Data?: { link?: string; order_id?: string } })?.Data;
    const emptyCheckout = data && !String(data.link || "").trim() && !String(data.order_id || "").trim();
    if (emptyCheckout || /collection failed/i.test(payload.error)) {
      throw new Error(
        "International card checkout is temporarily unavailable from our payment partner. "
        + "Try charging in NGN (Nigeria card checkout), or top up your wallet first and send from balance.",
      );
    }
    throw new Error(providerMsg || payload.error);
  }
  if (!payload.success || !payload.payment_link) {
    throw new Error(payload.message || "Checkout link unavailable");
  }
  return payload;
}

export async function getNombaPayStatus(txnId: string): Promise<NombaPayStatus | null> {
  const { data } = await (supabase as any)
    .from("nomba_pay_transactions")
    .select("id, status, amount, currency, credit_amount, credit_currency, failure_reason, order_id")
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
    order_id: data.order_id,
  };
}
