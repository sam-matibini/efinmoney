/**
 * Card-funded send corridor matrix (collect → credit wallet → payout).
 */

import { productFeatures } from "@/lib/productFeatures";
import type { CardSendProvider } from "@/lib/cardSendIntent";
import { minAmount } from "@/lib/flutterwave";

export const CARD_SEND_COLLECT_CURRENCIES = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "NGN",
  "GHS",
  "KES",
  "UGX",
  "RWF",
  "TZS",
  "ZMW",
  "XAF",
  "XOF",
] as const;

const LENHUB_COLLECT = ["USD", "CAD", "EUR", "GBP", "NGN", "GHS", "KES", "UGX"] as const;
const LENHUB_NGN_BANK_SOURCES = ["NGN", "USD", "CAD", "EUR", "GBP"];
const LENHUB_GHS_SOURCES = [...LENHUB_NGN_BANK_SOURCES, "GHS"];
const LENHUB_KES_SOURCES = [...LENHUB_GHS_SOURCES, "KES", "UGX"];
const LENHUB_UGX_SOURCES = [...LENHUB_GHS_SOURCES, "UGX", "KES"];

const PAYTOTA_COLLECT = ["USD", "EUR", "GBP", "CAD", "UGX", "KES", "RWF"] as const;
const PAYTOTA_MOMO_DEST = ["UGX", "KES", "RWF"] as const;

const SWYCHR_COLLECT = ["XAF", "XOF", "KES", "UGX"] as const;

/** Flutterwave collect currencies used for card-send. */
const FLW_COLLECT = ["USD", "CAD", "NGN", "GHS", "KES", "UGX", "RWF", "TZS", "ZMW"] as const;
const FLW_MOMO_DEST = ["GHS", "KES", "UGX", "RWF", "TZS", "ZMW"] as const;

/**
 * Fincra hosted collect for card-send (wallet credit currency = source).
 * USD/CAD excluded — partner confirmed no collect on those corridors.
 */
const FINCRA_CARD_COLLECT = [
  "NGN",
  "EUR",
  "GBP",
  "GHS",
  "KES",
  "UGX",
  "TZS",
  "ZMW",
  "ZAR",
  "XAF",
  "XOF",
  "MWK",
] as const;

export function isCardSendCollectCurrency(currency: string): boolean {
  return (CARD_SEND_COLLECT_CURRENCIES as readonly string[]).includes(currency.toUpperCase());
}

export function cardSendProvidersForCorridor(
  sourceCurrency: string,
  destCurrency: string,
  transferType: "bank" | "mobile_money",
): CardSendProvider[] {
  const s = sourceCurrency.toUpperCase();
  const d = destCurrency.toUpperCase();
  const out: CardSendProvider[] = [];

  // Dest must be a card-send payout corridor we support
  const destOk =
    (d === "NGN" && transferType === "bank") ||
    (transferType === "mobile_money" && ["GHS", "KES", "UGX", "RWF", "TZS", "ZMW"].includes(d));
  if (!destOk) return out;

  // Square hosted card checkout — debit/credit collect on the western currencies.
  if (productFeatures.square && (SQUARE_CARD_COLLECT as readonly string[]).includes(s)) {
    out.push("square");
  }

  if (productFeatures.fincra && (FINCRA_CARD_COLLECT as readonly string[]).includes(s)) {
    out.push("fincra");
  }


  if (
    productFeatures.nombaNigeria &&
    s === "NGN" &&
    d === "NGN" &&
    transferType === "bank"
  ) {
    out.push("nomba");
  }

  if (productFeatures.lenhubFlutter && (LENHUB_COLLECT as readonly string[]).includes(s)) {
    if (d === "NGN" && transferType === "bank" && LENHUB_NGN_BANK_SOURCES.includes(s)) {
      out.push("lenhub");
    }
    if (d === "GHS" && transferType === "mobile_money" && LENHUB_GHS_SOURCES.includes(s)) {
      out.push("lenhub");
    }
    if (d === "KES" && transferType === "mobile_money" && LENHUB_KES_SOURCES.includes(s)) {
      out.push("lenhub");
    }
    if (d === "UGX" && transferType === "mobile_money" && LENHUB_UGX_SOURCES.includes(s)) {
      out.push("lenhub");
    }
  }

  if (
    productFeatures.paytota &&
    (PAYTOTA_COLLECT as readonly string[]).includes(s) &&
    transferType === "mobile_money" &&
    (PAYTOTA_MOMO_DEST as readonly string[]).includes(d)
  ) {
    out.push("paytota");
  }

  if (productFeatures.swychr && (SWYCHR_COLLECT as readonly string[]).includes(s)) {
    if (d === "NGN" && transferType === "bank") {
      out.push("swychr");
    }
    if (
      transferType === "mobile_money" &&
      (d === "KES" || d === "UGX") &&
      (s === "KES" || s === "UGX" || s === "XAF" || s === "XOF")
    ) {
      out.push("swychr");
    }
  }

  if (productFeatures.flutterwave && (FLW_COLLECT as readonly string[]).includes(s)) {
    if (transferType === "mobile_money" && (FLW_MOMO_DEST as readonly string[]).includes(d)) {
      out.push("flutterwave");
    }
    if (d === "NGN" && transferType === "bank" && ["NGN", "USD", "CAD", "EUR", "GBP"].includes(s)) {
      out.push("flutterwave");
    }
  }

  return out;
}

/**
 * Auto-pick card collect provider.
 * Fincra first where live, then Flutterwave, then Nomba, then the rest.
 */
export function pickBestCardProvider(
  sourceCurrency: string,
  destCurrency: string,
  transferType: "bank" | "mobile_money",
): CardSendProvider | null {
  const available = cardSendProvidersForCorridor(sourceCurrency, destCurrency, transferType);
  if (available.length === 0) return null;
  const priority: CardSendProvider[] = ["fincra", "flutterwave", "nomba", "lenhub", "paytota", "swychr"];
  for (const p of priority) {
    if (available.includes(p)) return p;
  }
  return available[0];
}

export function cardSendDestCurrencies(sourceCurrency: string): string[] {
  const s = sourceCurrency.toUpperCase();
  const dests = new Set<string>();
  for (const d of ["NGN", "GHS", "KES", "UGX", "RWF", "TZS", "ZMW"] as const) {
    const types: Array<"bank" | "mobile_money"> =
      d === "NGN" ? ["bank"] : ["mobile_money"];
    for (const t of types) {
      if (cardSendProvidersForCorridor(s, d, t).length > 0) dests.add(d);
    }
  }
  return [...dests];
}

export function cardSendProviderLabel(provider: CardSendProvider): string {
  if (provider === "fincra") return "Secure checkout";
  if (provider === "nomba") return "Express card";
  if (provider === "lenhub") return "Card (direct)";
  if (provider === "paytota") return "MoMo checkout";
  if (provider === "swychr") return "Mobile checkout";
  return "Card checkout";
}

export function cardSendProviderBenefit(provider: CardSendProvider): string {
  if (provider === "fincra") return "Flexible";
  if (provider === "nomba") return "Fast";
  if (provider === "lenhub") return "In-app";
  if (provider === "paytota") return "Hosted";
  if (provider === "swychr") return "MoMo";
  return "Hosted";
}

export function cardSendProviderDescription(provider: CardSendProvider): string {
  if (provider === "fincra") {
    return "Pay by card or bank transfer on a secure page, then we deliver the transfer.";
  }
  if (provider === "nomba") {
    return "Quick card payment on a secure checkout page, then we deliver the transfer.";
  }
  if (provider === "lenhub") {
    return "Enter your card in the app — PIN/OTP secured — then we deliver the transfer.";
  }
  if (provider === "paytota") {
    return "Pay on a secure MoMo / invoice page, then we deliver the transfer.";
  }
  if (provider === "swychr") {
    return "Pay via mobile money checkout, then we deliver the transfer.";
  }
  return "Pay on a secure card checkout page, then we deliver the transfer.";
}

export function cardSendProviderStaffName(provider: CardSendProvider): string {
  if (provider === "fincra") return "Fincra";
  if (provider === "nomba") return "Nomba";
  if (provider === "lenhub") return "Lenhub";
  if (provider === "paytota") return "Paytota";
  if (provider === "swychr") return "Swychr";
  return "Flutterwave";
}

export function cardSendMinAmount(provider: CardSendProvider, currency: string): number {
  const c = currency.toUpperCase();
  if (provider === "fincra") {
    return c === "NGN" ? 100 : 1;
  }
  if (provider === "nomba") {
    if (c === "NGN") return 100;
    return 1;
  }
  if (provider === "lenhub") {
    return c === "NGN" ? 100 : 1;
  }
  if (provider === "paytota") {
    if (c === "UGX" || c === "RWF") return 500;
    if (c === "KES") return 10;
    return 1;
  }
  if (provider === "flutterwave") {
    return minAmount(c);
  }
  return 1;
}

/** Prefer card for FLW hosted collect; MoMo STK only when card isn't listed for that wallet. */
export function flutterwaveCardSendPaymentMethod(
  sourceCurrency: string,
): "card" | "mobilemoney" {
  const c = sourceCurrency.toUpperCase();
  if (["KES", "UGX", "GHS", "RWF", "TZS", "ZMW"].includes(c)) return "card";
  return "card";
}
