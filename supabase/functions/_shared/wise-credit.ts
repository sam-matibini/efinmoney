import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTopupEmail } from "./topup-email.ts";

type Admin = ReturnType<typeof createClient>;

/** Wise settlement asset codes (1320+) — avoid Fincra 128x / Dodo 1295+ / FX Liquidity 1300. */
const WISE_SETTLEMENT_BY_CURRENCY: Record<string, string> = {
  USD: "1320",
  CAD: "1321",
  EUR: "1322",
  GBP: "1323",
  NGN: "1324",
  GHS: "1325",
  KES: "1326",
  UGX: "1327",
  ZAR: "1328",
  AUD: "1329",
  NZD: "1330",
  SGD: "1331",
  HKD: "1332",
  PLN: "1333",
  RON: "1334",
  CZK: "1335",
  HUF: "1336",
  TRY: "1337",
  INR: "1338",
  PHP: "1339",
  MYR: "1340",
  THB: "1341",
  IDR: "1342",
  JPY: "1343",
  CHF: "1344",
  SEK: "1345",
  NOK: "1346",
  DKK: "1347",
  MXN: "1348",
  BRL: "1349",
};

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

async function resolveWiseSettlementAccount(admin: Admin, currency: string) {
  const code = WISE_SETTLEMENT_BY_CURRENCY[currency];
  if (code) {
    const { data } = await admin.from("ledger_accounts").select("id").eq("code", code).maybeSingle();
    if (data?.id) return data;
  }
  const { data } = await admin.from("ledger_accounts")
    .select("id")
    .eq("currency_code", currency)
    .ilike("name", "Wise Settlement%")
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

export async function creditWalletViaWise(
  admin: Admin,
  userId: string,
  currency: string,
  amount: number,
  idempotencyRef: string,
  walletIdFromMeta?: string,
  desc = "Top-up via Wise",
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
    .eq("reference_type", "wise_topup").eq("external_reference", idempotencyRef).limit(1);
  if (existing && existing.length > 0) return { wallet_id: walletId, already: true };

  const asset = await resolveWiseSettlementAccount(admin, ccy);
  const liab = await resolveLiabilityAccount(admin, ccy);

  if (!asset || !liab) {
    throw new Error(
      `Missing Wise ledger accounts for ${ccy}` +
        ` (settlement=${WISE_SETTLEMENT_BY_CURRENCY[ccy] || "?"}, liability=${LIABILITY_BY_CURRENCY[ccy] || "?"})`,
    );
  }

  const journalId = crypto.randomUUID();
  const { error } = await admin.from("ledger_entries").insert([
    {
      journal_id: journalId, account_id: asset.id, wallet_id: null, currency_code: ccy,
      debit_amount: amount, credit_amount: 0, description: desc,
      reference_type: "wise_topup", external_reference: idempotencyRef,
    },
    {
      journal_id: journalId, account_id: liab.id, wallet_id: walletId, currency_code: ccy,
      debit_amount: 0, credit_amount: amount, description: desc,
      reference_type: "wise_topup", external_reference: idempotencyRef,
    },
  ]);
  if (error) throw new Error(error.message ?? "Ledger insert failed");

  try {
    await admin.from("notifications").insert({
      user_id: userId,
      title: "Wallet topped up",
      message: `${ccy} ${amount} added to your wallet via Wise.`,
      type: "transfer",
    });
  } catch { /* best-effort */ }

  sendTopupEmail(admin, userId, ccy, amount, idempotencyRef).catch(() => {});

  return { wallet_id: walletId, already: false };
}
