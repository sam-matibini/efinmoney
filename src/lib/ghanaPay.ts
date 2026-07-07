import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

export interface GhanaCollectionResult {
  success: boolean;
  transaction_id: string;
  provider_reference: string;
  status: string;
  message: string;
}

export interface GhanaPayStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  amount: number;
  currency: string;
  failure_reason: string | null;
  provider_reference: string | null;
}

export async function initiateGhanaCollection(params: {
  amount: number;
  target_wallet_id: string;
  phone: string;
  network: string;
  customer_name?: string;
}): Promise<GhanaCollectionResult> {
  const { data, error } = await supabase.functions.invoke("ghana-collection", { body: params });
  if (error) throw new Error(await invokeErrorMessage(error));
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as GhanaCollectionResult;
}

export async function getGhanaPayStatus(txnId: string): Promise<GhanaPayStatus | null> {
  const { data } = await (supabase as any)
    .from("ghana_pay_transactions")
    .select("id, status, amount, currency, failure_reason, provider_reference")
    .eq("id", txnId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    amount: Number(data.amount),
    currency: data.currency,
    failure_reason: data.failure_reason,
    provider_reference: data.provider_reference,
  };
}

/** Ghana prefix → network (MTN 024/054/055, Telecel 020, AirtelTigo 027/057/026/056) */
export function networkFromGhanaPhone(raw: string): "MTN" | "AIR" | "VOD" | null {
  let n = raw.replace(/[^\d]/g, "");
  if (n.startsWith("233")) n = n.slice(3);
  if (n.startsWith("0")) n = n.slice(1);
  if (n.length < 3) return null;
  const prefix = n.slice(0, 3);
  if (["024", "054", "055", "053", "059"].includes(prefix)) return "MTN";
  if (["020", "050"].includes(prefix)) return "VOD";
  if (["027", "057", "026", "056"].includes(prefix)) return "AIR";
  return null;
}
