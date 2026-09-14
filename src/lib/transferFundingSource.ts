/**
 * `transfers.funding_source` is constrained to wallet | card | bank
 * (`transfers_funding_source_check`). Checkout rails such as Interac
 * Autodeposit and Wise are UI pay-in methods; they park as bank-funded
 * until the CAD wallet is credited.
 */
export type DbFundingSource = "wallet" | "card" | "bank";

export type UiFundingSource =
  | DbFundingSource
  | "interac"
  | "wise"
  | "eft"
  | "flutterwave"
  | string;

export function toDbFundingSource(
  funding?: UiFundingSource | null,
  opts?: { prepaidCardAsWallet?: boolean },
): DbFundingSource {
  const v = String(funding || "wallet").trim().toLowerCase();
  if (v === "interac" || v === "wise" || v === "bank" || v === "eft") return "bank";
  if (v === "card") return opts?.prepaidCardAsWallet ? "wallet" : "card";
  return "wallet";
}
