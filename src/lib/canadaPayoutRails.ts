// Canada domestic payout rail toggles.
// Interac + EFT pay out through Nomba. Interac pay-in is Fincra Autodeposit.
// Card pay-in is Nomba Checkout. Paysafe and Flovide are not CAD rails.

/** @deprecated Paysafe is retired for CAD. Always false. */
export const PAYSAFE_PAYOUTS_ENABLED = false;

function viteFlagOn(key: string, defaultOn = true): boolean {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    const raw = env?.[key];
    if (raw == null) return defaultOn;
    return raw !== "false";
  } catch {
    return defaultOn;
  }
}

/** Interac e-Transfer payout (CAD via Nomba). On unless explicitly disabled. */
export const INTERAC_ETRANSFER_ENABLED = viteFlagOn("VITE_INTERAC_ETRANSFER_ENABLED");

/** Canadian bank EFT payout (Nomba). On unless explicitly disabled. */
export const CAD_BANK_EFT_ENABLED = viteFlagOn("VITE_CAD_EFT_PAYOUTS_ENABLED");

/** Stripe-backed rails are not offered on Canada domestic send. */
export const STRIPE_CANADA_RAILS_NOTE = "";
