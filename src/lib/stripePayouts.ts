import { getStripe } from "@/lib/stripe";

export interface DebitCardInput {
  number: string;
  exp_month: number;
  exp_year: number;
  cvc: string;
  name: string;
  currency: "cad";
}

export interface TokenizedCard {
  token: string;
  last4: string;
  brand: string;
}

/**
 * Tokenize a Canadian debit card for a Stripe Connect external_account.
 * Uses Stripe's `tokens.create({ card })` so the raw PAN never touches our server.
 */
export async function tokenizeDebitCard(input: DebitCardInput): Promise<TokenizedCard> {
  const stripe = await getStripe();
  if (!stripe) throw new Error("Stripe.js not available");

  // @stripe/stripe-js exposes createToken('card', cardData) for raw card tokens.
  const result = await (stripe as any).createToken("card", {
    number: input.number.replace(/\s+/g, ""),
    exp_month: input.exp_month,
    exp_year: input.exp_year,
    cvc: input.cvc,
    name: input.name,
    currency: input.currency,
  });

  if (result.error) {
    throw new Error(result.error.message || "Card tokenization failed");
  }
  const tok = result.token;
  return {
    token: tok.id,
    last4: tok.card?.last4 || "",
    brand: tok.card?.brand || "",
  };
}
