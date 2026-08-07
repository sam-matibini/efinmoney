import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendTopupEmail } from "./topup-email.ts";

type Admin = ReturnType<typeof createClient>;

/** PayPal/Braintree settlement assets (1370+) — avoid Square 1360 / Wise 1320 / Dodo 1295. */
const PAYPAL_SETTLEMENT_BY_CURRENCY: Record<string, string> = {
  USD: "1370",
  CAD: "1371",
  EUR: "1372",
  GBP: "1373",
};

const LIABILITY_BY_CURRENCY: Record<string, string> = {
  USD: "2100",
  CAD: "2101",
  EUR: "2104",
  GBP: "2105",
};

async function resolveSettlement(admin: Admin, currency: string) {
  const code = PAYPAL_SETTLEMENT_BY_CURRENCY[currency];
  if (code) {
    const { data } = await admin.from("ledger_accounts").select("id").eq("code", code).maybeSingle();
    if (data?.id) return data;
  }
  const { data } = await admin.from("ledger_accounts")
    .select("id")
    .eq("currency_code", currency)
    .ilike("name", "PayPal Settlement%")
    .limit(1)
    .maybeSingle();
  return data;
}

async function resolveLiability(admin: Admin, currency: string) {
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

export async function creditWalletViaPayPal(
  admin: Admin,
  userId: string,
  currency: string,
  amount: number,
  idempotencyRef: string,
  walletIdFromMeta?: string,
  desc = "Top-up via PayPal",
): Promise<{ wallet_id: string; already: boolean }> {
  const ccy = currency.toUpperCase();
  const ref = String(idempotencyRef || "").trim();
  if (!ref) throw new Error("Missing PayPal top-up reference");
  if (!Number.isFinite(amount) || !(amount > 0)) {
    throw new Error(`Invalid PayPal credit amount: ${amount}`);
  }

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
    .eq("reference_type", "paypal_topup").eq("external_reference", ref).limit(1);
  if (existing?.length) return { wallet_id: walletId, already: true };

  const asset = await resolveSettlement(admin, ccy);
  const liab = await resolveLiability(admin, ccy);
  if (!asset || !liab) {
    throw new Error(
      `Missing PayPal ledger accounts for ${ccy}` +
        ` (settlement=${PAYPAL_SETTLEMENT_BY_CURRENCY[ccy] || "?"}, liability=${LIABILITY_BY_CURRENCY[ccy] || "?"})`,
    );
  }

  const journalId = crypto.randomUUID();
  const { error } = await admin.from("ledger_entries").insert([
    {
      journal_id: journalId, account_id: asset.id, wallet_id: null, currency_code: ccy,
      debit_amount: amount, credit_amount: 0, description: desc,
      reference_type: "paypal_topup", external_reference: ref, created_by: userId,
    },
    {
      journal_id: journalId, account_id: liab.id, wallet_id: walletId, currency_code: ccy,
      debit_amount: 0, credit_amount: amount, description: desc,
      reference_type: "paypal_topup", external_reference: ref, created_by: userId,
    },
  ]);
  if (error) {
    if (String(error.message || "").toLowerCase().includes("duplicate")
      || String((error as { code?: string }).code || "") === "23505") {
      return { wallet_id: walletId, already: true };
    }
    throw new Error(error.message ?? "Ledger insert failed");
  }

  try {
    await admin.from("notifications").insert({
      user_id: userId,
      title: "Wallet credited",
      message: `${ccy} ${amount} added to your wallet.`,
      type: "transfer",
    });
  } catch { /* best-effort */ }

  sendTopupEmail(admin, userId, ccy, amount, ref).catch(() => {});
  return { wallet_id: walletId, already: false };
}
