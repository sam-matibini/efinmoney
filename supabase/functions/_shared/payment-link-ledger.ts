import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** Per-currency escrow liability (code is globally unique on ledger_accounts). */
export const PENDING_CLAIM_LEDGER_CODE: Record<string, string> = {
  CAD: "2199",
  USD: "2201",
  EUR: "2202",
  GBP: "2203",
};

const PENDING_CLAIM_CODES = new Set(Object.values(PENDING_CLAIM_LEDGER_CODE));

/** Customer wallet liability (21xx), excluding escrow pending-claim accounts. */
export async function getWalletLiabilityAccountId(
  admin: SupabaseClient,
  currency: string,
): Promise<string | null> {
  const { data: rows } = await admin
    .from("ledger_accounts")
    .select("id, code")
    .like("code", "21%")
    .eq("currency_code", currency)
    .eq("is_active", true);

  const row = (rows ?? []).find((r) => !PENDING_CLAIM_CODES.has(String(r.code)));
  return row?.id ?? null;
}

export async function getPendingClaimAccountId(
  admin: SupabaseClient,
  currency: string,
): Promise<string | null> {
  const mapped = PENDING_CLAIM_LEDGER_CODE[currency];
  if (mapped) {
    const { data } = await admin
      .from("ledger_accounts")
      .select("id")
      .eq("code", mapped)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // Legacy row: code 2199 tagged with currency (only CAD may exist in older DBs).
  const { data: legacy } = await admin
    .from("ledger_accounts")
    .select("id")
    .eq("code", "2199")
    .eq("currency_code", currency)
    .maybeSingle();
  return legacy?.id ?? null;
}
