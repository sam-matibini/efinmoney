import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Admin = ReturnType<typeof createClient>;

export function isFincraWalletTopUp(meta: Record<string, unknown> | null | undefined, ref: string): boolean {
  if (meta?.type === "wallet_topup") return true;
  if (ref.startsWith("efm_fincra_")) return true;
  if (ref.startsWith("topup-fincra-")) return true;
  return false;
}

export async function creditWalletViaFincra(
  admin: Admin,
  userId: string,
  currency: string,
  amount: number,
  idempotencyRef: string,
  walletIdFromMeta?: string,
  desc = "Top-up via Fincra",
): Promise<{ wallet_id: string; already: boolean }> {
  let walletId = walletIdFromMeta || "";
  if (walletId) {
    const { data: w } = await admin.from("wallets").select("id, user_id, currency_code")
      .eq("id", walletId).maybeSingle();
    if (!w || w.user_id !== userId || String(w.currency_code).toUpperCase() !== currency) walletId = "";
  }
  if (!walletId) {
    const { data: wallet } = await admin.from("wallets").select("id")
      .eq("user_id", userId).eq("currency_code", currency).maybeSingle();
    walletId = wallet?.id as string | undefined ?? "";
  }
  if (!walletId) {
    const { data: nw, error: wErr } = await admin.from("wallets")
      .insert({ user_id: userId, currency_code: currency, is_default: false })
      .select("id").single();
    if (wErr || !nw) throw new Error(wErr?.message ?? "Could not create wallet");
    walletId = nw.id as string;
  }

  const { data: existing } = await admin.from("ledger_entries").select("id")
    .eq("reference_type", "fincra_topup").eq("external_reference", idempotencyRef).limit(1);
  if (existing && existing.length > 0) return { wallet_id: walletId, already: true };

  const { data: asset } = await admin.from("ledger_accounts")
    .select("id").eq("currency_code", currency)
    .ilike("name", "Fincra Settlement%")
    .limit(1).maybeSingle();

  const { data: liab } = await admin.from("ledger_accounts")
    .select("id").like("code", "21%").eq("currency_code", currency)
    .ilike("name", "Customer Wallet Liability%")
    .limit(1).maybeSingle();

  if (!asset || !liab) {
    throw new Error(`Missing Fincra ledger accounts for ${currency}`);
  }

  const journalId = crypto.randomUUID();
  const { error } = await admin.from("ledger_entries").insert([
    {
      journal_id: journalId, account_id: asset.id, wallet_id: null, currency_code: currency,
      debit_amount: amount, credit_amount: 0, description: desc,
      reference_type: "fincra_topup", external_reference: idempotencyRef,
    },
    {
      journal_id: journalId, account_id: liab.id, wallet_id: walletId, currency_code: currency,
      debit_amount: 0, credit_amount: amount, description: desc,
      reference_type: "fincra_topup", external_reference: idempotencyRef,
    },
  ]);
  if (error) throw new Error(error.message ?? "Ledger insert failed");

  try {
    await admin.from("notifications").insert({
      user_id: userId,
      title: "Wallet credited",
      message: `${currency} ${amount} added to your wallet.`,
      type: "transfer",
    });
  } catch { /* best-effort */ }

  return { wallet_id: walletId, already: false };
}
