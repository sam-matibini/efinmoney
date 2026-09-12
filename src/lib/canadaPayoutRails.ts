// Canada domestic payout rail toggles.
// Interac + EFT pay out through Nomba. Interac pay-in is Fincra Autodeposit.
// Card pay-in is Nomba Checkout. Paysafe and Flovide are not CAD rails.

/** @deprecated Paysafe is retired for CAD. Always false. */
export const PAYSAFE_PAYOUTS_ENABLED = false;

/** Interac e-Transfer payout (CAD via Nomba). On unless explicitly disabled. */
export const INTERAC_ETRANSFER_ENABLED =
  import.meta.env.VITE_INTERAC_ETRANSFER_ENABLED !== "false";

/** Canadian bank EFT payout (Nomba). On unless explicitly disabled. */
export const CAD_BANK_EFT_ENABLED =
  import.meta.env.VITE_CAD_EFT_PAYOUTS_ENABLED !== "false";

/** Stripe-backed rails available as extra CAD delivery options. */
export const STRIPE_CANADA_RAILS_NOTE =
  "Instant debit-card and payment-link delivery use Stripe when that rail is on.";
