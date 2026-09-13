/**
 * Nuvei Payment Middleware (sandbox).
 * Docs: https://www.nuveiplatforms.com/payment-middleware.html
 *
 * CAD Bank EFT will debit via Nuvei ACH once live keys exist.
 * Until then the Bank checkout shows Nuvei EFT as Coming soon.
 * Card collect stays Nomba. Interac collect stays Fincra Autodeposit.
 */

export const NUVEI_MW_DOCS = "https://www.nuveiplatforms.com/payment-middleware.html";

/** Sandbox host from Nuvei Payment Middleware explorer. */
export const NUVEI_MW_SANDBOX_BASE = "https://devapi.nuveiconnect.com";

/** Default sandbox gateway for ACH / EFT (CheckCommerce). Override with NUVEI_MW_GATEWAY. */
export const NUVEI_MW_DEFAULT_GATEWAY = "CheckCommerce";

export const NUVEI_MW_GATEWAYS = [
  "CheckCommerce",
  "PayaConnect",
  "CardConnect",
  "NCPV1",
  "AuthorizeNet",
  "PayaCore",
  "Till",
  "BMO",
] as const;

export type NuveiMwGateway = (typeof NUVEI_MW_GATEWAYS)[number];

/** Live CAD debit is off until Nuvei issues production keys. */
export const NUVEI_CAD_EFT_LIVE = false;

export function nuveiCadEftComingSoon(): boolean {
  return !NUVEI_CAD_EFT_LIVE;
}

export type NuveiAchProcessBody = {
  language: "en" | "fr";
  locale: "en-CA" | "fr-CA";
  displayInIframe: boolean;
  isConfirm: boolean;
  accountBillingInfo: {
    name: string;
    email: string;
    customerID: string;
    country: "CA";
  };
  transactionPayment: {
    amount: string;
    displayAmount: string;
    orderId: string;
    currencyCode: "CAD";
    currencySymbol: "C$";
    transactionType: "sale";
  };
  transactionAccountInformation: {
    createProfile: boolean;
    accountType: "ACH";
  };
};

export function buildNuveiCadEftSale(opts: {
  amount: number;
  orderId: string;
  name: string;
  email: string;
  customerId: string;
  lang?: "en" | "fr";
}): NuveiAchProcessBody {
  const amount = Math.round(Number(opts.amount) * 100) / 100;
  const lang = opts.lang === "fr" ? "fr" : "en";
  return {
    language: lang,
    locale: lang === "fr" ? "fr-CA" : "en-CA",
    displayInIframe: true,
    isConfirm: true,
    accountBillingInfo: {
      name: opts.name,
      email: opts.email,
      customerID: opts.customerId,
      country: "CA",
    },
    transactionPayment: {
      amount: amount.toFixed(2),
      displayAmount: `C$${amount.toFixed(2)}`,
      orderId: opts.orderId,
      currencyCode: "CAD",
      currencySymbol: "C$",
      transactionType: "sale",
    },
    transactionAccountInformation: {
      createProfile: false,
      accountType: "ACH",
    },
  };
}
