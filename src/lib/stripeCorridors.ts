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

// ── Recipient-side KYC descriptors, keyed by the link's payout CURRENCY ──────
// The claim page only knows the link currency, not the original destination, so
// KYC fields are derived from currency. EUR spans several countries, so the
// recipient picks their country; single-country currencies are fixed.
export interface ClaimCountry { iso: string; name: string }
export interface ClaimKyc {
  countries: ClaimCountry[];        // selectable recipient countries (len 1 unless EUR)
  postalLabel: string;
  postalRegex: string;              // serialised regex source (so it works in Deno + browser)
  stateLabel?: string;              // when set, a state/province is required
  states?: { code: string; name: string }[];
  personalIdLabel?: string;         // e.g. US "SSN (last 4)" — added to Stripe individual.ssn_last_4
  personalIdRegex?: string;
}

const CA_PROVINCES = [
  ["AB","Alberta"],["BC","British Columbia"],["MB","Manitoba"],["NB","New Brunswick"],
  ["NL","Newfoundland and Labrador"],["NS","Nova Scotia"],["NT","Northwest Territories"],
  ["NU","Nunavut"],["ON","Ontario"],["PE","Prince Edward Island"],["QC","Quebec"],
  ["SK","Saskatchewan"],["YT","Yukon"],
].map(([code, name]) => ({ code, name }));

const US_STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
  ["DC","District of Columbia"],
].map(([code, name]) => ({ code, name }));

const EU_CLAIM_COUNTRIES: ClaimCountry[] = [
  { iso: "DE", name: "Germany" }, { iso: "FR", name: "France" }, { iso: "IT", name: "Italy" },
  { iso: "ES", name: "Spain" }, { iso: "NL", name: "Netherlands" }, { iso: "BE", name: "Belgium" },
  { iso: "PT", name: "Portugal" }, { iso: "IE", name: "Ireland" }, { iso: "AT", name: "Austria" },
];

export const CLAIM_KYC_BY_CURRENCY: Record<string, ClaimKyc> = {
  CAD: {
    countries: [{ iso: "CA", name: "Canada" }],
    postalLabel: "Postal code",
    postalRegex: "^[A-Za-z]\\d[A-Za-z] ?\\d[A-Za-z]\\d$",
    stateLabel: "Province",
    states: CA_PROVINCES,
  },
  USD: {
    countries: [{ iso: "US", name: "United States" }],
    postalLabel: "ZIP code",
    postalRegex: "^\\d{5}(-\\d{4})?$",
    stateLabel: "State",
    states: US_STATES,
    personalIdLabel: "SSN (last 4)",
    personalIdRegex: "^\\d{4}$",
  },
  GBP: {
    countries: [{ iso: "GB", name: "United Kingdom" }],
    postalLabel: "Postcode",
    postalRegex: "^[A-Za-z0-9 ]{4,10}$",
  },
  EUR: {
    countries: EU_CLAIM_COUNTRIES,
    postalLabel: "Postal code",
    postalRegex: "^[A-Za-z0-9 -]{3,12}$",
  },
};

export function getClaimKyc(currency: string | null | undefined): ClaimKyc | null {
  if (!currency) return null;
  return CLAIM_KYC_BY_CURRENCY[currency.toUpperCase()] ?? null;
}

// Whether recipient card payouts are available for a link in this currency.
export function isClaimCardCurrency(currency: string | null | undefined): boolean {
  return !!currency && currency.toUpperCase() in CLAIM_KYC_BY_CURRENCY;
}
