/** Customer segment — Layer 3 of the pricing architecture. */
export type CustomerSegment = "consumer" | "business" | "enterprise" | "partner_api" | "high_volume";

export type PricingChannel = "wallet" | "external";

export type PayoutMethod =
  | "WALLET_TO_WALLET"
  | "BANK"
  | "MOBILE_MONEY"
  | "WALLET"
  | "CASH_PICKUP"
  | "CARD_PAYOUT"
  | "STABLECOIN"
  | "CORPORATE"
  | "WALLET_BANK";

export type RecommendedPosition =
  | "Highly competitive"
  | "Competitive"
  | "Higher-risk corridor"
  | "Higher-cost corridor"
  | "Ecosystem";

export interface CostComponents {
  partner_cost_pct: number;
  partner_fixed_fee: number;
  payment_cost_pct: number;
  payment_fixed_fee: number;
  payout_cost_fixed: number;
  liquidity_cost_pct: number;
  risk_cost_pct: number;
  required_margin: number;
}

export interface CorridorRateCard {
  corridor_id: string;
  source_currency: string;
  destination_currency: string;
  payout_method: PayoutMethod;
  channel: PricingChannel;
  delivery: string;
  partner: string | null;
  efin_fx_spread: number;
  efin_transfer_fee_pct: number;
  transfer_fee: number;
  minimum_fee: number;
  maximum_fee: number;
  fee_currency: string;
  recommended_position: RecommendedPosition;
  estimated_delivery: string;
  costs: CostComponents;
  volume_discount: number;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
  /** live = partner corridor, template = launch card, corrected = admin overlay */
  origin?: "live" | "template" | "corrected";
}

export interface VolumeDiscountTier {
  id: string;
  min_monthly_volume: number;
  max_monthly_volume: number | null;
  fx_spread_discount: number | null;
  transfer_fee_discount: number | null;
  label: string;
  custom: boolean;
}

export interface PayoutMinimum {
  payout_method: PayoutMethod;
  label: string;
  minimum_fee: number;
  fee_currency: string;
}

export type PricingWorkbook = {
  corridors: CorridorRateCard[];
  wallets: CorridorRateCard[];
  volumes: VolumeDiscountTier[];
  payouts: PayoutMinimum[];
};

export interface QuoteInput {
  sourceCurrency: string;
  destinationCurrency: string;
  amount: number;
  payoutMethod?: PayoutMethod | string | null;
  fundingMethod?: string | null;
  customerType?: CustomerSegment | string | null;
  monthlyVolume?: number;
  partner?: string | null;
  channel?: PricingChannel;
  midMarketRate?: number | null;
  negotiatedFxSpread?: number | null;
}

export interface CostBreakdown {
  partnerCost: number;
  paymentCost: number;
  payoutCost: number;
  liquidityCost: number;
  riskCost: number;
  totalCost: number;
}

export interface TransferQuote {
  corridorId: string;
  channel: PricingChannel;
  payoutMethod: PayoutMethod;
  sourceCurrency: string;
  destinationCurrency: string;
  amount: number;
  midMarketRate: number | null;
  customerRate: number | null;
  fxSpread: number;
  transferFeePct: number;
  volumeDiscount: number;
  volumeTierLabel: string;
  requiresNegotiation: boolean;
  variableFee: number;
  minimumFee: number;
  maximumFee: number | null;
  transferFee: number;
  fxMargin: number;
  feeCurrency: string;
  cost: CostBreakdown;
  requiredMargin: number;
  minimumRevenue: number;
  totalRevenue: number;
  grossContribution: number;
  floorApplied: boolean;
  youSend: number;
  totalCharged: number;
  youReceive: number | null;
  estimatedDelivery: string;
  recommendedPosition: RecommendedPosition;
  pricingMissing: boolean;
}
