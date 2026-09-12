/** Map a Plaid Account.balances object onto plaid_accounts columns. */

export type PlaidBalanceFields = {
  available_balance: number | null;
  current_balance: number | null;
  balances_iso_currency: string | null;
  balances_updated_at: string;
  currency_code: string;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function plaidBalanceFields(
  balances: Record<string, unknown> | null | undefined,
  fallbackCcy = "CAD",
): PlaidBalanceFields {
  const ccy = String(
    balances?.iso_currency_code || balances?.unofficial_currency_code || fallbackCcy || "CAD",
  ).toUpperCase();
  return {
    available_balance: asNumber(balances?.available),
    current_balance: asNumber(balances?.current),
    balances_iso_currency: ccy,
    balances_updated_at: new Date().toISOString(),
    currency_code: ccy,
  };
}
