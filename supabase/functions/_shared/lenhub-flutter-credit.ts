/**
 * Shared wallet credit for Lenhub Flutter top-ups (webhook + client settle).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** Flutterwave Settlement codes (123x) — not Nomba 1260. */
export const LENHUB_SETTLEMENT_BY_CURRENCY: Record<string, string> = {
  NGN: "1231",
  USD: "1230",
  EUR: "1238",
  GBP: "1239",
  CAD: "1240",
  GHS: "1234",
  KES: "1232",
  UGX: "1233",
  RWF: "1236",
  TZS: "1237",
};

export const LENHUB_LIABILITY_BY_CURRENCY: Record<string, string> = {
  NGN: "2102",
  USD: "2100",
  CAD: "2101",
  EUR: "2104",
  GBP: "2105",
  GHS: "2102",
  KES: "2102",
  UGX: "2102",
  RWF: "2102",
  TZS: "2102",
};

export async function creditLenhubFlutterTopup(
  supabase: SupabaseClient,
  params: {
    userId: string;
    walletId: string | null;
    currency: string;
    amount: number;
    chargeRowId: string;
    chargeId: string;
  },
): Promise<{ credited: boolean; reason: string }> {
  const { data: already } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("reference_type", "lenhub_flutter_topup")
    .eq("reference_id", params.chargeRowId)
    .limit(1);
  if (already?.length) return { credited: false, reason: "already_credited" };

  let walletId = params.walletId;
  if (!walletId) {
    const { data: wallet } = await supabase
      .from("wallets")
      .select("id")
      .eq("user_id", params.userId)
      .eq("currency_code", params.currency)
      .maybeSingle();
    walletId = wallet?.id ?? null;
  }
  if (!walletId) return { credited: false, reason: "wallet_missing" };

  const assetCode =
    LENHUB_SETTLEMENT_BY_CURRENCY[params.currency] || LENHUB_SETTLEMENT_BY_CURRENCY.USD;
  const liabCode =
    LENHUB_LIABILITY_BY_CURRENCY[params.currency] || LENHUB_LIABILITY_BY_CURRENCY.USD;
  const { data: asset } = await supabase.from("ledger_accounts").select("id").eq("code", assetCode)
    .maybeSingle();
  const { data: liab } = await supabase.from("ledger_accounts").select("id").eq("code", liabCode)
    .maybeSingle();
  if (!asset || !liab) return { credited: false, reason: "ledger_account_missing" };

  const journalId = crypto.randomUUID();
  const desc = `Lenhub Flutter top-up ${params.chargeId}`.slice(0, 500);
  const { error } = await supabase.from("ledger_entries").insert([
    {
      journal_id: journalId,
      account_id: asset.id,
      wallet_id: null,
      currency_code: params.currency,
      debit_amount: params.amount,
      credit_amount: 0,
      description: desc,
      reference_type: "lenhub_flutter_topup",
      reference_id: params.chargeRowId,
      external_reference: params.chargeId,
      created_by: params.userId,
    },
    {
      journal_id: journalId,
      account_id: liab.id,
      wallet_id: walletId,
      currency_code: params.currency,
      debit_amount: 0,
      credit_amount: params.amount,
      description: desc,
      reference_type: "lenhub_flutter_topup",
      reference_id: params.chargeRowId,
      external_reference: params.chargeId,
      created_by: params.userId,
    },
  ]);
  if (error) return { credited: false, reason: error.message };
  return { credited: true, reason: "ok" };
}
