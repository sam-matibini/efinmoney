import type { Stripe, StripeCardNumberElement } from "@stripe/stripe-js";

export interface TokenizedCard {
  token: string;
  last4: string;
  brand: string;
}

/**
 * Tokenize a card via Stripe Elements (used for charging the SENDER's funding card).
 * Raw PAN never leaves the Stripe iframe.
 *
 * Pass `currency` (lowercase ISO, e.g. "cad", "usd", "gbp", "eur") only when the
 * token will be used as a payout destination (Visa Direct). For regular charges,
 * omit it.
 */
export async function tokenizeDebitCard(
  stripe: Stripe,
  cardNumberElement: StripeCardNumberElement,
  opts: { name: string; currency?: string }
): Promise<TokenizedCard> {
  const tokenData: Record<string, string> = { name: opts.name };
  if (opts.currency) tokenData.currency = opts.currency;
  const result = await stripe.createToken(cardNumberElement, tokenData);

  if (result.error) {
    throw new Error(result.error.message || "Card tokenization failed");
  }
  const tok = result.token!;
  return {
    token: tok.id,
    last4: tok.card?.last4 || "",
    brand: tok.card?.brand || "",
  };
}
