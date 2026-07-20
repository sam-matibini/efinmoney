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
      if (body?.message) return String(body.message);
    } catch {
      /* ignore */
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
  mode?: "live" | "sandbox";
}

export interface ElicateChargeStatus {
  id?: string;
  charge_id?: string;
  status: "pending" | "awaiting_approval" | "completed" | "failed" | "cancelled" | "expired";
  amount_minor: number;
  currency: string;
  failure_reason?: string | null;
  provider_reference?: string | null;
  settled?: boolean;
  provider_status?: string;
}

export async function initiateElicateCharge(params: {
  amount: number;
  target_wallet_id: string;
  phone: string;
  network: string;
  customer_name?: string;
  return_url?: string;
}): Promise<ElicateChargeResult> {
  const { data, error } = await supabase.functions.invoke("elicate-charge", { body: params });
  if (error) throw new Error(await invokeErrorMessage(error));
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as ElicateChargeResult;
}

/** Poll provider + settle via edge (preferred over DB-only). */
export async function pollElicateChargeStatus(params: {
  charge_id?: string;
  transaction_id?: string;
}): Promise<ElicateChargeStatus> {
  const { data, error } = await supabase.functions.invoke("elicate-status", { body: params });
  if (error) throw new Error(await invokeErrorMessage(error));
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  const payload = data as ElicateChargeStatus & { charge_id?: string };
  return {
    ...payload,
    id: payload.charge_id ?? payload.id,
    status: payload.status,
    amount_minor: payload.amount_minor,
    currency: payload.currency,
  };
}

export async function getElicateChargeStatus(chargeId: string): Promise<ElicateChargeStatus | null> {
  try {
    return await pollElicateChargeStatus({ charge_id: chargeId });
  } catch {
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
}

export interface ElicatePaymentLinkRow {
  id: string;
  slug: string | null;
  url: string | null;
  name: string;
  type: string;
  amount: number | null;
  min_amount: number | null;
  active: boolean;
  wallet_id: string | null;
  created_at: string;
}

export async function listElicatePaymentLinks(): Promise<ElicatePaymentLinkRow[]> {
  const { data, error } = await supabase.functions.invoke("elicate-payment-links", {
    body: { action: "list" },
  });
  if (error) throw new Error(await invokeErrorMessage(error));
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return ((data as { links?: ElicatePaymentLinkRow[] }).links ?? []) as ElicatePaymentLinkRow[];
}

export async function createElicatePaymentLink(params: {
  name: string;
  type: "fixed" | "flexible";
  amount?: number;
  min_amount?: number;
  description?: string;
  wallet_id: string;
  redirect_url?: string;
}): Promise<ElicatePaymentLinkRow> {
  const { data, error } = await supabase.functions.invoke("elicate-payment-links", {
    body: { action: "create", ...params },
  });
  if (error) throw new Error(await invokeErrorMessage(error));
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return (data as { link: ElicatePaymentLinkRow }).link;
}

export async function updateElicatePaymentLink(params: {
  id: string;
  active?: boolean;
  name?: string;
}): Promise<ElicatePaymentLinkRow> {
  const { data, error } = await supabase.functions.invoke("elicate-payment-links", {
    body: { action: "update", ...params },
  });
  if (error) throw new Error(await invokeErrorMessage(error));
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return (data as { link: ElicatePaymentLinkRow }).link;
}
