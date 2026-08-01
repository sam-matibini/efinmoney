import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTopupEmail } from "./topup-email.ts";

type Admin = ReturnType<typeof createClient>;

/** Dodo settlement asset codes (1295+) — avoid Fincra 128x / Nomba collisions. */
const DODO_SETTLEMENT_BY_CURRENCY: Record<string, string> = {
  USD: "1295",
  CAD: "1296",
  EUR: "1297",
  GBP: "1298",
  NGN: "1299",
};

const LIABILITY_BY_CURRENCY: Record<string, string> = {
  USD: "2100",
  CAD: "2101",
  NGN: "2102",
  EUR: "2104",
  GBP: "2105",
};

async function resolveDodoSettlementAccount(admin: Admin, currency: string) {
  const code = DODO_SETTLEMENT_BY_CURRENCY[currency];
  if (code) {
    const { data } = await admin.from("ledger_accounts").select("id").eq("code", code).maybeSingle();
    if (data?.id) return data;
  }
  const { data } = await admin.from("ledger_accounts")
    .select("id")
    .eq("currency_code", currency)
    .ilike("name", "Dodo Settlement%")
    .limit(1)
    .maybeSingle();
  return data;
}

async function resolveLiabilityAccount(admin: Admin, currency: string) {
  const code = LIABILITY_BY_CURRENCY[currency];
  if (code) {
    const { data } = await admin.from("ledger_accounts").select("id").eq("code", code).maybeSingle();
    if (data?.id) return data;
  }
  const { data } = await admin.from("ledger_accounts")
    .select("id")
    .like("code", "21%")
    .eq("currency_code", currency)
    .ilike("name", "Customer Wallet Liability%")
    .limit(1)
    .maybeSingle();
  return data;
}

export async function creditWalletViaDodo(
  admin: Admin,
  userId: string,
  currency: string,
  amount: number,
  idempotencyRef: string,
  walletIdFromMeta?: string,
  desc = "Top-up via Dodo Payments",
): Promise<{ wallet_id: string; already: boolean }> {
  const ccy = currency.toUpperCase();
  let walletId = walletIdFromMeta || "";
  if (walletId) {
    const { data: w } = await admin.from("wallets").select("id, user_id, currency_code")
      .eq("id", walletId).maybeSingle();
    if (!w || w.user_id !== userId || String(w.currency_code).toUpperCase() !== ccy) walletId = "";
  }
  if (!walletId) {
    const { data: wallet } = await admin.from("wallets").select("id")
      .eq("user_id", userId).eq("currency_code", ccy).maybeSingle();
    walletId = wallet?.id as string | undefined ?? "";
  }
  if (!walletId) {
    const { data: nw, error: wErr } = await admin.from("wallets")
      .insert({ user_id: userId, currency_code: ccy, is_default: false })
      .select("id").single();
    if (wErr || !nw) throw new Error(wErr?.message ?? "Could not create wallet");
    walletId = nw.id as string;
  }

  const { data: existing } = await admin.from("ledger_entries").select("id")
    .eq("reference_type", "dodo_topup").eq("external_reference", idempotencyRef).limit(1);
  if (existing && existing.length > 0) return { wallet_id: walletId, already: true };

  const asset = await resolveDodoSettlementAccount(admin, ccy);
  const liab = await resolveLiabilityAccount(admin, ccy);
  if (!asset || !liab) {
    throw new Error(
      `Missing ledger accounts for Dodo ${ccy} top-up (settlement=${!!asset}, liability=${!!liab}). Run Dodo settlement migration.`,
    );
  }

  const journalId = crypto.randomUUID();
  const amt = Math.round(amount * 100) / 100;
  const { error: insErr } = await admin.from("ledger_entries").insert([
    {
      journal_id: journalId, account_id: asset.id, wallet_id: null, currency_code: ccy,
      debit_amount: amt, credit_amount: 0, description: desc,
      reference_type: "dodo_topup", external_reference: idempotencyRef,
    },
    {
      journal_id: journalId, account_id: liab.id, wallet_id: walletId, currency_code: ccy,
      debit_amount: 0, credit_amount: amt, description: desc,
      reference_type: "dodo_topup", external_reference: idempotencyRef,
    },
  ]);
  if (insErr) throw new Error(insErr.message);

  try {
    await admin.from("notifications").insert({
      user_id: userId,
      title: "Wallet credited",
      message: `${ccy} ${amt} added to your wallet.`,
      type: "transfer",
    });
  } catch { /* best-effort */ }

  sendTopupEmail(admin, userId, ccy, amt, idempotencyRef).catch(() => {});

  return { wallet_id: walletId, already: false };
}
