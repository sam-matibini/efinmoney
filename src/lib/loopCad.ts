/** Shared Loop Bank CAD collection details for the web app. */

export type LoopCadEft = {
  bankNumber: string;
  transitNumber: string;
  accountNumber: string;
};

export const LOOP_CAD_INTERAC_ALIAS = "etx@efin.money";

export const LOOP_CAD_EFT: LoopCadEft = {
  bankNumber: "621",
  transitNumber: "20002",
  accountNumber: "500010169796",
};

/**
 * Loop Billing / Request Payment URL from the Loop dashboard.
 * Set VITE_LOOP_BILLING_PAYMENT_LINK in .env (or Vercel) to show the method in checkout.
 */
export const LOOP_BILLING_PAYMENT_LINK = String(
  import.meta.env.VITE_LOOP_BILLING_PAYMENT_LINK || "",
).trim();

export function loopBillingLinkConfigured(): boolean {
  return /^https?:\/\//i.test(LOOP_BILLING_PAYMENT_LINK);
}

export function formatLoopEftLines(eft: LoopCadEft = LOOP_CAD_EFT): string[] {
  return [
    `Institution (Bank #): ${eft.bankNumber}`,
    `Transit #: ${eft.transitNumber}`,
    `Account #: ${eft.accountNumber}`,
  ];
}
