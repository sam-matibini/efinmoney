import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

async function invokeErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) {
        const detail = body.detail?.message || body.detail?.error || "";
        return detail ? `${body.error}: ${detail}` : body.error;
      }
    } catch {
      /* ignore parse errors */
    }
  }
  return error instanceof Error ? error.message : "Request failed";
}

export interface ElicateChargeResult {
  success: boolean;
  charge_id: string;
  transaction_id: string | null;
  provider_reference: string;
  redirect_url: string | null;
  status: "awaiting_approval" | "completed" | "failed";
  message: string;
}

export interface ElicateChargeStatus {
  id: string;
  status: "pending" | "awaiting_approval" | "completed" | "failed" | "cancelled" | "expired";
  amount_minor: number;
  currency: string;
  failure_reason: string | null;
  provider_reference: string | null;
}

export async function initiateElicateCharge(params: {
  amount: number;
  target_wallet_id: string;
  phone: string;
  network: string;
  customer_name?: string;
}): Promise<ElicateChargeResult> {
  const { data, error } = await supabase.functions.invoke("elicate-charge", { body: params });
  if (error) throw new Error(await invokeErrorMessage(error));
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as ElicateChargeResult;
}

export async function getElicateChargeStatus(chargeId: string): Promise<ElicateChargeStatus | null> {
  // Cast to any: elicate_charges is added in migration 20260621170000 but the
  // generated supabase types haven't been regenerated yet. Safe — RLS scopes
  // reads to rows the user owns.
  const { data } = await (supabase as any)
    .from("elicate_charges")
    .select("id,status,amount_minor,currency,failure_reason,psp_reference")
    .eq("id", chargeId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    status: data.status as ElicateChargeStatus["status"],
    amount_minor: data.amount_minor,
    currency: data.currency,
    failure_reason: data.failure_reason,
    provider_reference: data.psp_reference,
  };
}
