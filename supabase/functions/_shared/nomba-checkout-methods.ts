/**
 * Nomba Checkout `allowedPaymentMethods` for card and bank/EFT collect.
 * Docs: Card, Transfer, USSD (NGN); Intl Card, Apple Pay, Intl Transfer (Pay by Bank).
 * CAD wallets are charged in USD — request both card and bank methods so Nomba
 * can show whichever the merchant account has enabled.
 */

export const NOMBA_CHECKOUT_METHODS = [
  "Card",
  "Transfer",
  "Nomba QR",
  "USSD",
  "Buy Now Pay Later",
  "MOMO",
  "Intl Card",
  "Apple Pay",
  "Intl Transfer",
] as const;

export type NombaCheckoutMethod = (typeof NOMBA_CHECKOUT_METHODS)[number];

/** eFinMoney collect rails on Nomba Checkout (not payout INTERAC/EFT). */
export type NombaCollectRail = "card" | "eft";

const CARD_METHODS: NombaCheckoutMethod[] = ["Intl Card", "Card", "Apple Pay"];
const EFT_METHODS_INTL: NombaCheckoutMethod[] = ["Intl Transfer", "Transfer"];
const EFT_METHODS_NGN: NombaCheckoutMethod[] = ["Transfer", "USSD"];

export function parseNombaCollectRails(raw: unknown): NombaCollectRail[] {
  const src = Array.isArray(raw) ? raw : raw == null || raw === "" ? ["card", "eft"] : [raw];
  const out: NombaCollectRail[] = [];
  for (const item of src) {
    const v = String(item || "").trim().toLowerCase();
    if ((v === "card" || v === "intl_card" || v === "apple_pay") && !out.includes("card")) {
      out.push("card");
    }
    if (
      (v === "eft" || v === "bank" || v === "transfer" || v === "bank_transfer" || v === "intl_transfer")
      && !out.includes("eft")
    ) {
      out.push("eft");
    }
  }
  return out.length ? out : ["card", "eft"];
}

/**
 * Payment methods to send on POST /v1/checkout/order.
 * `checkoutCurrency` is what Nomba charges (USD for CAD wallets).
 * `creditCurrency` is the wallet we credit (CAD).
 */
export function nombaCheckoutAllowedPaymentMethods(params: {
  checkoutCurrency: string;
  creditCurrency?: string;
  rails?: NombaCollectRail[];
}): NombaCheckoutMethod[] {
  const checkout = String(params.checkoutCurrency || "").toUpperCase();
  const credit = String(params.creditCurrency || checkout).toUpperCase();
  const rails = params.rails?.length ? params.rails : ["card", "eft"] as NombaCollectRail[];
  const wantCard = rails.includes("card");
  const wantEft = rails.includes("eft");
  const out: NombaCheckoutMethod[] = [];

  if (checkout === "NGN" || credit === "NGN") {
    if (wantCard) out.push("Card");
    if (wantEft) out.push(...EFT_METHODS_NGN);
    return uniqueMethods(out);
  }

  if (wantCard) out.push(...CARD_METHODS);
  if (wantEft) out.push(...EFT_METHODS_INTL);
  return uniqueMethods(out);
}

export function isNombaPaymentMethodError(message: string): boolean {
  return /allowedPaymentMethods|payment method|invalid method|unsupported method|not supported for/i
    .test(String(message || ""));
}

function uniqueMethods(list: NombaCheckoutMethod[]): NombaCheckoutMethod[] {
  const seen = new Set<string>();
  const out: NombaCheckoutMethod[] = [];
  for (const m of list) {
    if (seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}
