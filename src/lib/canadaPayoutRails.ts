// Canada domestic payout rail toggles.
// Interac + EFT pay out through Nomba → Flovide → Paysafe.
// Stripe still powers optional debit-card push, Connect, and payment-link claims.

export const PAYSAFE_PAYOUTS_ENABLED =
  import.meta.env.VITE_PAYSAFE_PAYOUTS_ENABLED === "true";

/** Interac e-Transfer payout (CAD). On unless explicitly disabled. */
export const INTERAC_ETRANSFER_ENABLED =
  import.meta.env.VITE_INTERAC_ETRANSFER_ENABLED !== "false";

/** Canadian bank EFT payout. On unless explicitly disabled. */
export const CAD_BANK_EFT_ENABLED =
  import.meta.env.VITE_CAD_EFT_PAYOUTS_ENABLED !== "false";

/** Stripe-backed rails available as extra CAD delivery options. */
export const STRIPE_CANADA_RAILS_NOTE = PAYSAFE_PAYOUTS_ENABLED
  ? null
  : "Instant debit-card and payment-link delivery use Stripe when that rail is on.";
