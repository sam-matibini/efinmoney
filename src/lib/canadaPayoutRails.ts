// Canada domestic payout rail toggles.
// Paysafe powers EFT + Interac; Stripe powers debit card, Connect, and payment-link card claims.
// Set VITE_PAYSAFE_PAYOUTS_ENABLED=true when Paysafe production credentials are live.

export const PAYSAFE_PAYOUTS_ENABLED =
  import.meta.env.VITE_PAYSAFE_PAYOUTS_ENABLED === "true";

export const INTERAC_ETRANSFER_ENABLED =
  PAYSAFE_PAYOUTS_ENABLED && import.meta.env.VITE_INTERAC_ETRANSFER_ENABLED !== "false";

/** Stripe-backed rails available while Paysafe is in test. */
export const STRIPE_CANADA_RAILS_NOTE = PAYSAFE_PAYOUTS_ENABLED
  ? null
  : "Bank transfer and Interac use Paysafe (still in test). Use Instant to debit card, Payment link, or My Stripe account.";
