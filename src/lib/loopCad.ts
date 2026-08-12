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
 * Override with VITE_LOOP_BILLING_PAYMENT_LINK. Default is the current Loop payor register link.
 * Note: signed `sgid` links can expire — replace from Loop dashboard when needed.
 */
const LOOP_BILLING_DEFAULT =
  "https://app.bankonloop.com/payor/register?sgid=eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaEpJajluYVdRNkx5OXNiMjl3TFdKaGJtdHBibWN2VUdGNWJXVnVkRkpsY1hWbGMzUXZNVEk0T0RNL1pYaHdhWEpsYzE5cGJqMHlOakk1TnpRMkJqb0dSVlE9IiwiZXhwIjoiMjAyNi0wOS0xMlQxNzo0MTo1Ny4xNjBaIiwicHVyIjoiZGVmYXVsdCJ9fQ==--ef6f9436aea3ea6d6bd0a9d56f6bf99ab9ae6cd0";

export const LOOP_BILLING_PAYMENT_LINK = String(
  import.meta.env.VITE_LOOP_BILLING_PAYMENT_LINK || LOOP_BILLING_DEFAULT,
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
