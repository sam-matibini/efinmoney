/**
 * Shared ledger settlement for Elicate ZMW collections (top-ups).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export async function settleElicateChargeCredit(
  supabase: SupabaseClient,
  charge: {
    id: string;
    user_id: string;
    amount_minor: number;
    target_wallet_id: string | null;
    status: string;
    psp_reference?: string | null;
  },
  providerRef: string | null,
  eventData?: unknown,
): Promise<{ ok: boolean; reason?: string; duplicate?: boolean }> {
  if (charge.status === "completed") return { ok: true, duplicate: true };
  if (!charge.target_wallet_id) return { ok: false, reason: "Charge has no target wallet" };

  const { data: clearing } = await supabase
    .from("ledger_accounts").select("id").eq("code", "1205").maybeSingle();
  const { data: liability } = await supabase
    .from("ledger_accounts").select("id").eq("code", "2108").maybeSingle();

  if (!clearing || !liability) return { ok: false, reason: "Ledger setup incomplete (1205/2108)" };

  const amountMajor = Number(charge.amount_minor) / 100;
  const journalId = crypto.randomUUID();
  const desc = `Zambia MoMo top-up (${providerRef ?? charge.id})`;
  const ref = providerRef ?? charge.psp_reference ?? null;

  const { data: existing } = await supabase
    .from("ledger_entries")
    .select("id")
    .eq("reference_type", "elicate_topup")
    .eq("reference_id", charge.id)
    .limit(1);
  if (!existing?.length) {
    const { error: leErr } = await supabase.from("ledger_entries").insert([
      {
        journal_id: journalId,
        account_id: clearing.id,
        wallet_id: null,
        currency_code: "ZMW",
        debit_amount: amountMajor,
        credit_amount: 0,
        description: desc,
        reference_type: "elicate_topup",
        reference_id: charge.id,
        external_reference: ref,
        created_by: charge.user_id,
      },
      {
        journal_id: journalId,
        account_id: liability.id,
        wallet_id: charge.target_wallet_id,
        currency_code: "ZMW",
        debit_amount: 0,
        credit_amount: amountMajor,
        description: desc,
        reference_type: "elicate_topup",
        reference_id: charge.id,
        external_reference: ref,
        created_by: charge.user_id,
      },
    ]);
    if (leErr) return { ok: false, reason: leErr.message };
  }

  await supabase.from("elicate_charges").update({
    status: "completed",
    psp_reference: providerRef ?? charge.psp_reference,
    last_event: eventData ?? null,
  }).eq("id", charge.id);

  await supabase.from("notifications").insert({
    user_id: charge.user_id,
    title: "Wallet Topped Up",
    message: `Your ZMW wallet has been credited ${amountMajor.toLocaleString()} ZMW.`,
    type: "wallet",
    is_read: false,
  }).then(() => null, () => null);

  return { ok: true };
}
