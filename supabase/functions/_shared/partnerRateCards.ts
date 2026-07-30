// Published partner rate cards used to seed `partner_pricing`, `partner_fx_rates`
// and the eFinMoney retail price book. These are starter values taken from each
// partner's public/contracted rate card — operators edit them in the Pricing
// panel; the seeder never overwrites a row an operator already curated.

export interface RateCardEntry {
  fixed_fee: number; // in fee_currency
  percentage_fee: number; // percent of send amount
  fx_markup_bps: number; // partner FX markup over mid-market
  settlement_fee?: number;
  network_fee?: number;
  compliance_fee?: number;
  min_fee?: number | null;
  max_fee?: number | null;
  fee_currency?: string;
}

export interface PartnerRateCard {
  /** Applied when no route-specific override matches. */
  default: RateCardEntry;
  /** Key format: `${dest_currency}:${payment_method}` or `${payment_method}`. */
  overrides?: Record<string, Partial<RateCardEntry>>;
  /** Spread the partner quotes over mid-market FX, in bps. */
  fx_spread_bps?: number;
  /** Human note carried into `source_reference`. */
  reference: string;
}

const CAD = "CAD";

export const PARTNER_RATE_CARDS: Record<string, PartnerRateCard> = {
  paysafe: {
    reference: "Paysafe Canada rate card (Interac/EFT)",
    fx_spread_bps: 0,
    default: { fixed_fee: 1.25, percentage_fee: 0, fx_markup_bps: 0, fee_currency: CAD },
    overrides: {
      "CAD:interac": { fixed_fee: 1.5 },
      "CAD:eft": { fixed_fee: 0.85, settlement_fee: 0.15 },
    },
  },
  stripe: {
    reference: "Stripe Connect instant payouts (Visa Direct)",
    fx_spread_bps: 100,
    default: { fixed_fee: 0, percentage_fee: 1.5, fx_markup_bps: 100, min_fee: 0.5, fee_currency: CAD },
    overrides: { "CAD:debit_card": { percentage_fee: 1.5, min_fee: 0.5 } },
  },
  pawapay: {
    reference: "PawaPay mobile money payout schedule",
    fx_spread_bps: 150,
    default: { fixed_fee: 0, percentage_fee: 1.75, fx_markup_bps: 150, network_fee: 0.2, fee_currency: CAD },
    overrides: {
      "NGN:mobile_money": { percentage_fee: 2.0 },
      "XAF:mobile_money": { percentage_fee: 2.25 },
      "XOF:mobile_money": { percentage_fee: 2.25 },
      "BWP:mobile_money": { percentage_fee: 1.9 },
      "MWK:mobile_money": { percentage_fee: 2.1 },
    },
  },
  flutterwave: {
    reference: "Flutterwave payout pricing",
    fx_spread_bps: 200,
    default: { fixed_fee: 0.75, percentage_fee: 1.4, fx_markup_bps: 200, fee_currency: CAD },
    overrides: {
      "NGN:bank": { fixed_fee: 0.35, percentage_fee: 0 },
      "GHS:mobile_money": { percentage_fee: 1.5 },
    },
  },
  yellowcard: {
    reference: "Yellow Card OTC payout pricing",
    fx_spread_bps: 175,
    default: { fixed_fee: 0, percentage_fee: 1.6, fx_markup_bps: 175, settlement_fee: 0.25, fee_currency: CAD },
    overrides: { "BWP:bank": { percentage_fee: 1.8 } },
  },
  circle_cpn: {
    reference: "Circle Payments Network corridor fees",
    fx_spread_bps: 60,
    default: { fixed_fee: 0.5, percentage_fee: 0.5, fx_markup_bps: 60, network_fee: 0.35, compliance_fee: 0.1, fee_currency: CAD },
  },
  stellar: {
    reference: "Stellar SEP-31 anchor fees",
    fx_spread_bps: 120,
    default: { fixed_fee: 0.3, percentage_fee: 1.0, fx_markup_bps: 120, network_fee: 0.05, fee_currency: CAD },
  },
  swychr: {
    reference: "Swychr payout pricing",
    fx_spread_bps: 220,
    default: { fixed_fee: 0.5, percentage_fee: 2.0, fx_markup_bps: 220, fee_currency: CAD },
  },
  fincra: {
    reference: "Fincra payout pricing",
    fx_spread_bps: 180,
    default: { fixed_fee: 0.6, percentage_fee: 1.3, fx_markup_bps: 180, fee_currency: CAD },
    overrides: { "CAD:interac": { fixed_fee: 1.75, percentage_fee: 0, fx_markup_bps: 0 } },
  },
  nomba: {
    reference: "Nomba NGN bank payout pricing",
    fx_spread_bps: 190,
    default: { fixed_fee: 0.3, percentage_fee: 0.9, fx_markup_bps: 190, fee_currency: CAD },
  },
  paytota: {
    reference: "Paytota payout pricing",
    fx_spread_bps: 210,
    default: { fixed_fee: 0.8, percentage_fee: 1.6, fx_markup_bps: 210, fee_currency: CAD },
  },
  mtn_momo: {
    reference: "MTN MoMo disbursement pricing",
    fx_spread_bps: 160,
    default: { fixed_fee: 0, percentage_fee: 1.5, fx_markup_bps: 160, network_fee: 0.15, fee_currency: CAD },
  },
  ghanapay: {
    reference: "Ghana Pay payout pricing",
    fx_spread_bps: 170,
    default: { fixed_fee: 0.4, percentage_fee: 1.45, fx_markup_bps: 170, fee_currency: CAD },
  },
};

export const resolveRateCard = (
  code: string,
  destCurrency: string,
  paymentMethod: string,
): (RateCardEntry & { reference: string }) | null => {
  const card = PARTNER_RATE_CARDS[code];
  if (!card) return null;
  const override =
    card.overrides?.[`${destCurrency}:${paymentMethod}`] ?? card.overrides?.[paymentMethod] ?? {};
  return {
    settlement_fee: 0,
    network_fee: 0,
    compliance_fee: 0,
    min_fee: null,
    max_fee: null,
    fee_currency: CAD,
    ...card.default,
    ...override,
    reference: card.reference,
  };
};

/** Retail price book — what eFinMoney charges the customer. */
export interface RetailEntry {
  fixed_fee: number;
  percentage_fee: number;
  fx_margin_bps: number;
  min_fee?: number | null;
}

export const RETAIL_PRICE_BOOK: Record<string, RetailEntry> = {
  // Domestic Canada
  "CAD:interac": { fixed_fee: 1.99, percentage_fee: 0, fx_margin_bps: 0 },
  "CAD:eft": { fixed_fee: 1.49, percentage_fee: 0, fx_margin_bps: 0 },
  "CAD:debit_card": { fixed_fee: 2.49, percentage_fee: 0.5, fx_margin_bps: 0 },
  // Cross-border defaults by method
  bank: { fixed_fee: 2.99, percentage_fee: 0.5, fx_margin_bps: 250 },
  mobile_money: { fixed_fee: 2.49, percentage_fee: 0.5, fx_margin_bps: 250 },
};

export const resolveRetail = (destCurrency: string, paymentMethod: string): RetailEntry =>
  RETAIL_PRICE_BOOK[`${destCurrency}:${paymentMethod}`] ??
  RETAIL_PRICE_BOOK[paymentMethod] ?? { fixed_fee: 2.99, percentage_fee: 0.5, fx_margin_bps: 250 };
