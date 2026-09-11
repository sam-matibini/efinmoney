/** Platform CAD Interac Autodeposit alias (Fincra). */
export const FINCRA_CAD_INTERAC_ALIAS = "support.cad.live-015@fincra.ca";

/** Short UI copy for the Fincra Interac pay-in rail. */
export function fincraInteracPayinHint(lang: "en" | "fr" = "en"): string {
  return lang === "fr"
    ? `Envoyez un Virement Interac Autodeposit à ${FINCRA_CAD_INTERAC_ALIAS}. Collez le code de paiement dans le message.`
    : `Send an Interac e-Transfer to ${FINCRA_CAD_INTERAC_ALIAS}. Paste the payment code in the message field.`;
}
