import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTopupEmail } from "./topup-email.ts";

type Admin = ReturnType<typeof createClient>;

/** Fincra settlement asset codes (128x — avoids collisions with Stripe/Nomba 125x). */
const FINCRA_SETTLEMENT_BY_CURRENCY: Record<string, string> = {
  NGN: "1280",
  KES: "1281",
  UGX: "1282",
  GHS: "1283",
  ZMW: "1284",
  RWF: "1285",
  TZS: "1286",
  USD: "1287",
  CAD: "1288",
  EUR: "1289",
  GBP: "1290",
  ZAR: "1291",
  XAF: "1292",
  XOF: "1293",
  MWK: "1294",
};

/** Customer wallet liability codes. */
const LIABILITY_BY_CURRENCY: Record<string, string> = {
  USD: "2100",
  CAD: "2101",
  NGN: "2102",
  EUR: "2104",
  GBP: "2105",
  GHS: "2106",
  TZS: "2107",
  ZMW: "2108",
  KES: "2110",
  UGX: "2111",
  RWF: "2112",
  ZAR: "2113",
  XAF: "2114",
  XOF: "2115",
  MWK: "2116",
};

export function isFincraWalletTopUp(meta: Record<string, unknown> | null | undefined, ref: string): boolean {
  if (meta?.type === "wallet_topup") return true;
  if (ref.startsWith("efm_fincra_")) return true;
  if (ref.startsWith("topup-fincra-")) return true;
  return false;
}

async function resolveFincraSettlementAccount(admin: Admin, currency: string) {
  const code = FINCRA_SETTLEMENT_BY_CURRENCY[currency];
  if (code) {
    const { data } = await admin.from("ledger_accounts").select("id").eq("code", code).maybeSingle();
    if (data?.id) return data;
  }
  // Legacy name lookup (pre-128x codes / older migrations)
  const { data } = await admin.from("ledger_accounts")
    .select("id")
    .eq("currency_code", currency)
    .ilike("name", "Fincra Settlement%")
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

export async function creditWalletViaFincra(
  admin: Admin,
  userId: string,
  currency: string,
  amount: number,
  idempotencyRef: string,
  walletIdFromMeta?: string,
  desc = "Top-up via Fincra",
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
    .eq("reference_type", "fincra_topup").eq("external_reference", idempotencyRef).limit(1);
  if (existing && existing.length > 0) return { wallet_id: walletId, already: true };

  const asset = await resolveFincraSettlementAccount(admin, ccy);
  const liab = await resolveLiabilityAccount(admin, ccy);

  if (!asset || !liab) {
    throw new Error(
      `Missing Fincra ledger accounts for ${ccy}` +
        ` (settlement=${FINCRA_SETTLEMENT_BY_CURRENCY[ccy] || "?"}, liability=${LIABILITY_BY_CURRENCY[ccy] || "?"})`,
    );
  }

  const journalId = crypto.randomUUID();
  const { error } = await admin.from("ledger_entries").insert([
    {
      journal_id: journalId, account_id: asset.id, wallet_id: null, currency_code: ccy,
      debit_amount: amount, credit_amount: 0, description: desc,
      reference_type: "fincra_topup", external_reference: idempotencyRef,
    },
    {
      journal_id: journalId, account_id: liab.id, wallet_id: walletId, currency_code: ccy,
      debit_amount: 0, credit_amount: amount, description: desc,
      reference_type: "fincra_topup", external_reference: idempotencyRef,
    },
  ]);
  if (error) throw new Error(error.message ?? "Ledger insert failed");

  try {
    await admin.from("notifications").insert({
      user_id: userId,
      title: "Wallet credited",
      message: `${ccy} ${amount} added to your wallet.`,
      type: "transfer",
    });
  } catch { /* best-effort */ }

  sendTopupEmail(admin, userId, ccy, amount, idempotencyRef).catch(() => {});

  return { wallet_id: walletId, already: false };
}
