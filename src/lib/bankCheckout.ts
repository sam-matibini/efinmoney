import { buildFincraRedirectUrl } from "@/lib/fincraTopup";

/** Fincra hosted checkout methods that include a bank-transfer rail. */
export const FINCRA_BANK_TRANSFER_CURRENCIES = ["NGN", "EUR", "GBP"] as const;

export type BankCheckoutPurpose = "topup" | "send" | "bank_move";

export function supportsFincraBankCheckout(currency: string): boolean {
  return FINCRA_BANK_TRANSFER_CURRENCIES.includes(
    currency.toUpperCase() as (typeof FINCRA_BANK_TRANSFER_CURRENCIES)[number],
  );
}

export function bankCheckoutRedirectPath(purpose: BankCheckoutPurpose): string {
  if (purpose === "send") return "/send";
  if (purpose === "bank_move") return "/wallet/receive";
  return "/wallet/topup";
}

export function buildBankCheckoutRedirectUrl(purpose: BankCheckoutPurpose) {
  return buildFincraRedirectUrl(bankCheckoutRedirectPath(purpose));
}

export function bankCheckoutReference(
  purpose: BankCheckoutPurpose,
  userId: string,
  walletId: string,
): string {
  const prefix = purpose === "send" ? "banksend-fincra" : purpose === "bank_move" ? "bankmove-fincra" : "banktopup-fincra";
  return `${prefix}-${(userId || "anon").slice(0, 8)}-${walletId.slice(0, 8)}-${Date.now()}`;
}
