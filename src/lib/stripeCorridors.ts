// Stripe card-push (Visa Direct / Mastercard Send) supported corridors.
//
// MUST stay in sync with the CORRIDOR allow-list in
// supabase/functions/stripe-payout/index.ts. Stripe can only push to recipient
// debit cards in CA / US / GB / EU-27 — it is NOT a global remittance network,
// so every other corridor stays on Flutterwave / mobile-money rails.
//
// Keyed by CountryInfo.id (the unique country name used in src/lib/countries.ts)
// because countries.ts stores a CURRENCY code in `.code`, not an ISO country
// code — but stripe-payout's CORRIDOR map keys on ISO country codes. This map
// bridges the two: id -> { iso (ISO-3166 alpha-2), currency (Stripe payout) }.

export interface StripeCorridor {
  iso: string;       // ISO-3166 alpha-2 country code (recipient_country sent to stripe-payout)
  currency: string;  // payout currency (UPPER); target_currency on the transfer
}

export const STRIPE_CARD_PUSH_CORRIDORS: Record<string, StripeCorridor> = {
  Canada: { iso: "CA", currency: "CAD" },
  "United States": { iso: "US", currency: "USD" },
  "United Kingdom": { iso: "GB", currency: "GBP" },
  // EU-27 entries present in countries.ts (code === "EUR")
  Germany: { iso: "DE", currency: "EUR" },
  France: { iso: "FR", currency: "EUR" },
  Italy: { iso: "IT", currency: "EUR" },
  Spain: { iso: "ES", currency: "EUR" },
  Netherlands: { iso: "NL", currency: "EUR" },
  Belgium: { iso: "BE", currency: "EUR" },
  Portugal: { iso: "PT", currency: "EUR" },
  Ireland: { iso: "IE", currency: "EUR" },
  Austria: { iso: "AT", currency: "EUR" },
};

// True when the given CountryInfo.id is reachable via Stripe card-push.
export function isStripeCardPushCorridor(countryId: string | null | undefined): boolean {
  return !!countryId && countryId in STRIPE_CARD_PUSH_CORRIDORS;
}

export function getStripeCorridor(countryId: string | null | undefined): StripeCorridor | null {
  if (!countryId) return null;
  return STRIPE_CARD_PUSH_CORRIDORS[countryId] ?? null;
}
