import type { Stripe, StripeCardNumberElement } from "@stripe/stripe-js";

export interface TokenizedCard {
  token: string;
  last4: string;
  brand: string;
}

/**
 * Tokenize a Canadian debit card via Stripe Elements.
 * The CardNumberElement keeps raw PAN inside Stripe's iframe — it never
 * touches our JS or our backend.
 */
export async function tokenizeDebitCard(
  stripe: Stripe,
  cardNumberElement: StripeCardNumberElement,
  opts: { name: string; currency?: "cad" }
): Promise<TokenizedCard> {
  const result = await stripe.createToken(cardNumberElement, {
    name: opts.name,
    currency: opts.currency ?? "cad",
  });

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
