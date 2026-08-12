/**
 * Credit eFinMoney wallet from Flovide settlement (Interac collect / payout reverse).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTopupEmail } from "./topup-email.ts";

type Admin = ReturnType<typeof createClient>;

const FLOVIDE_SETTLEMENT_BY_CURRENCY: Record<string, string> = {
  USD: "1380",
  CAD: "1381",
  EUR: "1382",
  GBP: "1383",
  NGN: "1384",
  GHS: "1385",
  KES: "1386",
  UGX: "1387",
  XOF: "1388",
  ZAR: "1389",
};

const LIABILITY_BY_CURRENCY: Record<string, string> = {
  USD: "2100",
  CAD: "2101",
  NGN: "2102",
  EUR: "2104",
  GBP: "2105",
  GHS: "2106",
  KES: "2110",
  UGX: "2111",
  ZAR: "2113",
  XOF: "2115",
};

async function resolveSettlement(admin: Admin, currency: string) {
  const code = FLOVIDE_SETTLEMENT_BY_CURRENCY[currency];
  if (!code) return null;
  const { data } = await admin.from("ledger_accounts").select("id").eq("code", code).maybeSingle();
  return data;
}

async function resolveLiability(admin: Admin, currency: string) {
  const code = LIABILITY_BY_CURRENCY[currency];
  if (!code) return null;
  const { data } = await admin.from("ledger_accounts").select("id").eq("code", code).maybeSingle();
  return data;
}

export async function creditWalletViaFlovide(
  admin: Admin,
  userId: string,
  currency: string,
  amount: number,
  idempotencyRef: string,
  walletIdFromMeta?: string,
  desc = "Top-up via Flovide Interac",
): Promise<{ wallet_id: string; already: boolean }> {
  const ccy = currency.toUpperCase();
  let walletId = walletIdFromMeta || "";
  if (walletId) {
    const { data: w } = await admin.from("wallets").select("id, user_id, currency_code")
      .eq("id", walletId).maybeSingle();
    if (!w || w.user_id !== userId || String(w.currency_code).toUpperCase() !== ccy) {
      walletId = "";
    }
  }
  if (!walletId) {
    const { data: w } = await admin.from("wallets").select("id")
      .eq("user_id", userId).eq("currency_code", ccy).order("created_at").limit(1).maybeSingle();
    if (!w) throw new Error(`No ${ccy} wallet for user`);
    walletId = w.id;
  }

  const { data: existing } = await admin.from("ledger_entries").select("id")
    .eq("reference_type", "flovide_topup")
    .eq("external_reference", idempotencyRef)
    .limit(1);
  if (existing?.length) return { wallet_id: walletId, already: true };

  const asset = await resolveSettlement(admin, ccy);
  const liab = await resolveLiability(admin, ccy);
  if (!asset || !liab) throw new Error(`Missing Flovide ledger mapping for ${ccy}`);

  const journalId = crypto.randomUUID();
  const { error } = await admin.from("ledger_entries").insert([
    {
      journal_id: journalId,
      account_id: asset.id,
      wallet_id: null,
      currency_code: ccy,
      debit_amount: amount,
      credit_amount: 0,
      description: desc,
      reference_type: "flovide_topup",
      reference_id: null,
      external_reference: idempotencyRef,
      created_by: userId,
    },
    {
      journal_id: journalId,
      account_id: liab.id,
      wallet_id: walletId,
      currency_code: ccy,
      debit_amount: 0,
      credit_amount: amount,
      description: desc,
      reference_type: "flovide_topup",
      reference_id: null,
      external_reference: idempotencyRef,
      created_by: userId,
    },
  ]);
  if (error) throw new Error(error.message || "Flovide ledger post failed");

  await admin.from("notifications").insert({
    user_id: userId,
    title: "Wallet topped up",
    message: `Your ${ccy} wallet was credited via Flovide Interac.`,
    type: "wallet",
  }).then(() => null, () => null);

  sendTopupEmail(admin, userId, ccy, amount, idempotencyRef).catch(() => {});

  return { wallet_id: walletId, already: false };
}
