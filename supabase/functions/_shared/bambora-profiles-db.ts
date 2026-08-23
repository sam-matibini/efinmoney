/**
 * Sync Bambora profile cards / bank into bambora_payment_methods.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { bamboraGetProfile, extractProfileCards } from "./bambora.ts";

export async function syncBamboraProfileToDb(
  admin: SupabaseClient,
  userId: string,
  customerCode: string,
  currency = "CAD",
) {
  const res = await bamboraGetProfile(customerCode);
  if (!res.ok && res.status === 404) return { ok: false, cards: [] as unknown[] };
  if (!res.ok) {
    throw new Error(String(res.json.message || `Profile fetch failed (${res.status})`));
  }

  const cards = extractProfileCards(res.json);
  const rows: Record<string, unknown>[] = [];

  for (const card of cards) {
    const cardId = Number(card.card_id ?? card.cardId ?? card.id ?? 0);
    if (!cardId) continue;
    rows.push({
      user_id: userId,
      customer_code: customerCode,
      method_type: "card",
      bambora_card_id: cardId,
      card_brand: String(card.card_type ?? card.cardType ?? card.brand ?? "card").toLowerCase(),
      last_four: String(card.last_four ?? card.last4 ?? "").slice(-4) || null,
      exp_month: Number(card.expiry_month ?? card.expiryMonth ?? 0) || null,
      exp_year: Number(card.expiry_year ?? card.expiryYear ?? 0) || null,
      cardholder_name: String(card.name ?? "") || null,
      currency_code: currency,
    });
  }

  const bank = res.json.bank_account as Record<string, unknown> | undefined;
  if (bank && bank.account_number) {
    const acct = String(bank.account_number);
    rows.push({
      user_id: userId,
      customer_code: customerCode,
      method_type: "bank",
      bambora_card_id: null,
      institution_number: String(bank.institution_number ?? ""),
      branch_number: String(bank.branch_number ?? ""),
      account_last_four: acct.slice(-4),
      bank_account_holder: String(bank.bank_account_holder ?? ""),
      currency_code: currency,
    });
  }

  if (rows.length) {
    for (const row of rows) {
      if (row.method_type === "card") {
        const { data: existing } = await admin.from("bambora_payment_methods")
          .select("id")
          .eq("user_id", userId)
          .eq("customer_code", customerCode)
          .eq("method_type", "card")
          .eq("bambora_card_id", row.bambora_card_id as number)
          .maybeSingle();
        if (existing?.id) {
          await admin.from("bambora_payment_methods").update(row).eq("id", existing.id);
        } else {
          await admin.from("bambora_payment_methods").insert(row);
        }
      } else {
        const { data: existing } = await admin.from("bambora_payment_methods")
          .select("id")
          .eq("user_id", userId)
          .eq("customer_code", customerCode)
          .eq("method_type", "bank")
          .maybeSingle();
        if (existing?.id) {
          await admin.from("bambora_payment_methods").update(row).eq("id", existing.id);
        } else {
          await admin.from("bambora_payment_methods").insert(row);
        }
      }
    }
  }

  return { ok: true, cards };
}

export async function upsertBamboraCardRow(
  admin: SupabaseClient,
  userId: string,
  customerCode: string,
  card: Record<string, unknown>,
  currency: string,
  isDefault = false,
) {
  const cardId = Number(card.card_id ?? card.cardId ?? card.id ?? 0);
  if (!cardId) throw new Error("Bambora did not return card_id");

  const row = {
    user_id: userId,
    customer_code: customerCode,
    method_type: "card",
    bambora_card_id: cardId,
    card_brand: String(card.card_type ?? card.cardType ?? "card").toLowerCase(),
    last_four: String(card.last_four ?? card.last4 ?? "").slice(-4) || null,
    exp_month: Number(card.expiry_month ?? 0) || null,
    exp_year: Number(card.expiry_year ?? 0) || null,
    cardholder_name: String(card.name ?? "") || null,
    currency_code: currency,
    is_default: isDefault,
  };

  const { data: existing } = await admin.from("bambora_payment_methods")
    .select("id")
    .eq("user_id", userId)
    .eq("customer_code", customerCode)
    .eq("method_type", "card")
    .eq("bambora_card_id", cardId)
    .maybeSingle();

  if (existing?.id) {
    await admin.from("bambora_payment_methods").update(row).eq("id", existing.id);
  } else {
    await admin.from("bambora_payment_methods").insert(row);
  }
  return cardId;
}
