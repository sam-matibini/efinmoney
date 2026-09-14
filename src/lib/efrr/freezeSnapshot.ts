import { supabase } from "@/integrations/supabase/client";

export type FreezeFxSnapshotInput = {
  transferId?: string | null;
  fxTransactionId?: string | null;
  fromCurrency: string;
  toCurrency: string;
  customerRate: number;
  efinSpread?: number;
  providerExecutionRate?: number | null;
  partner?: string | null;
  sourceAmount?: number | null;
  customerAmount?: number | null;
  feeAmount?: number | null;
  transactionStatus?: string | null;
  transactionRef?: string | null;
};

/** Persist an immutable FINTRAC/RPAA FX snapshot. Safe to call more than once. */
export async function freezeFxSnapshot(input: FreezeFxSnapshotInput): Promise<string | null> {
  if (!input.transferId && !input.fxTransactionId) return null;
  if (!(Number(input.customerRate) > 0)) return null;
  const { data, error } = await supabase.rpc("freeze_fx_snapshot", {
    p_transfer_id: input.transferId ?? null,
    p_fx_transaction_id: input.fxTransactionId ?? null,
    p_from_currency: input.fromCurrency,
    p_to_currency: input.toCurrency,
    p_customer_rate: input.customerRate,
    p_efin_spread: input.efinSpread ?? 0,
    p_provider_execution_rate: input.providerExecutionRate ?? null,
    p_partner: input.partner ?? null,
    p_source_amount: input.sourceAmount ?? null,
    p_customer_amount: input.customerAmount ?? null,
    p_fee_amount: input.feeAmount ?? null,
    p_transaction_status: input.transactionStatus ?? null,
    p_transaction_ref: input.transactionRef ?? null,
  });
  if (error) {
    console.warn("freeze_fx_snapshot", error.message);
    return null;
  }
  return data ? String(data) : null;
}
