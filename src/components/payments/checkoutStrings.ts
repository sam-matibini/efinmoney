/** Local EN/FR strings + Canadian lookups for the Interac checkout only. */

import { FINCRA_CAD_INTERAC_ALIAS } from "@/lib/fincraCad";

export type Lang = "en" | "fr";

export const CHECKOUT_STRINGS = {
  en: {
    selectMethod: "Select a payment method",
    interac: "Interac",
    interacDesc: "Use your bank account to approve an instant Interac payment",
    plaid: "Bank EFT",
    plaidDesc: "Pay by EFT from your linked Canadian bank to Loop Bank",
    loopBilling: "Loop payment link",
    loopBillingDesc: "Pay via Loop Billing (EFT bank debit · ~4 business days)",
    card: "Card",
    cardDesc: "Use debit or credit card to make instant payments",
    visaDirect: "Visa Direct",
    visaDirectDesc: "Use Visa debit card to make instant payments",
    eft: "Bank EFT",
    eftDesc: "Direct bank deposit — arrives in 1-2 business days",
    wise: "Wise",
    wiseDesc: "Pay with bank or card via Wise",
    back: "Back",
    accountType: "Account type",
    personal: "Personal",
    business: "Business",
    phone: "Phone",
    firstName: "First name",
    lastName: "Last name",
    email: "E-mail",
    bank: "Select your bank",
    bankHint: "We remember this bank in this window and open it when you pay.",
    billingAddress: "Billing address",
    line1: "Address line 1",
    line2: "Address line 2",
    city: "City",
    province: "Province/Territory",
    postal: "Postal code",
    country: "Country",
    amountDue: "Amount due",
    pay: (amount: string) => `Pay ${amount}`,
    poweredBy: "Powered by eFinMoney",
    openBank: "Copy payment details",
    openHosted: "Continue",
    pushHint:
      `Send an Interac Autodeposit e-Transfer to ${FINCRA_CAD_INTERAC_ALIAS}. Put the reference in the message field so we can match your deposit.`,
    detailsCopied: "Payment details copied — paste them in your e-Transfer",
    waiting: "Waiting for your Interac e-Transfer…",
    received: "Payment received",
    paymentDetails: "Copy payment details",
    sendTo: "Interac email",
    reference: "Payment code",
    stillNotSent: "Hide payment details",
    showDetails: "Show payment details",
    bankNumber: "Institution (Bank #)",
    transitNumber: "Transit #",
    accountNumber: "Account #",
    eftHint: "Or pay by EFT / bank transfer using these details:",
    flovideWaiting: "Waiting for your Interac e-Transfer…",
    flovidePushHint:
      "Send an Interac Autodeposit e-Transfer to efin@flovide.com. Put the reference in the message field so we can match your deposit.",
    flovideRequestTo: "Send to",
    flovidePoweredBy: "Powered by eFinMoney · Flovide",
    flovideCopyHint: "Autodeposit is on — no security question. Put the reference in the message field.",
    flovideDetailsCopied: "Payment details copied — paste them in your e-Transfer",
    fincraWaiting: "Waiting for your Interac e-Transfer…",
    fincraPushHint:
      `Send an Interac Autodeposit e-Transfer to ${FINCRA_CAD_INTERAC_ALIAS}. Paste the payment code in the message field so Fincra can match your deposit.`,
    interacBankRef: "e-Transfer reference number",
    interacBankRefHint: "From your bank confirmation after you send — for example CAh9ECkx.",
    interacBankRefPlaceholder: "CAh9ECkx",
    interacAmountTransferred: "Amount transferred",
    interacAmountTransferredHint: (amount: string) =>
      `Enter the exact amount you sent. It must match ${amount} or Complete will not go through.`,
    interacAmountTransferredPlaceholder: "0.00",
    interacQty: "Qty",
    interacQtyHint: "Enter 1 — this checkout is one order.",
    interacComplete: "Complete",
  },
  fr: {
    selectMethod: "Choisissez un mode de paiement",
    interac: "Interac",
    interacDesc: "Approuvez un paiement Interac instantané dans votre banque",
    plaid: "TEF bancaire",
    plaidDesc: "Payez par TEF depuis votre banque canadienne liée vers Loop Bank",
    loopBilling: "Lien de paiement Loop",
    loopBillingDesc: "Payer via Loop Billing (TEF · ~4 jours ouvrables)",
    card: "Carte",
    cardDesc: "Utilisez une carte de débit ou de crédit",
    visaDirect: "Visa Direct",
    visaDirectDesc: "Utilisez une carte de débit Visa pour payer instantanément",
    eft: "Virement bancaire (TEF)",
    eftDesc: "Dépôt bancaire direct — 1 à 2 jours ouvrables",
    wise: "Wise",
    wiseDesc: "Payer par virement ou carte via Wise",
    back: "Retour",
    accountType: "Type de compte",
    personal: "Personnel",
    business: "Entreprise",
    phone: "Téléphone",
    firstName: "Prénom",
    lastName: "Nom",
    email: "Courriel",
    bank: "Choisissez votre banque",
    bankHint: "Nous mémorisons cette banque dans cette fenêtre et l'ouvrons au moment du paiement.",
    billingAddress: "Adresse de facturation",
    line1: "Adresse ligne 1",
    line2: "Adresse ligne 2",
    city: "Ville",
    province: "Province/Territoire",
    postal: "Code postal",
    country: "Pays",
    amountDue: "Montant dû",
    pay: (amount: string) => `Payer ${amount}`,
    poweredBy: "Propulsé par eFinMoney",
    openBank: "Copier les détails",
    openHosted: "Continuer",
    pushHint:
      `Envoyez un Virement Interac Autodeposit à ${FINCRA_CAD_INTERAC_ALIAS}. Mettez la référence dans le message pour que nous puissions apparier le dépôt.`,
    detailsCopied: "Détails copiés — collez-les dans votre Virement Interac",
    waiting: "En attente de votre Virement Interac…",
    received: "Paiement reçu",
    paymentDetails: "Copier les détails",
    sendTo: "Courriel Interac",
    reference: "Code de paiement",
    stillNotSent: "Masquer les détails",
    showDetails: "Afficher les détails",
    bankNumber: "Institution (n° de banque)",
    transitNumber: "N° de transit",
    accountNumber: "N° de compte",
    eftHint: "Ou payez par TEF / virement bancaire :",
    flovideWaiting: "En attente de votre Virement Interac…",
    flovidePushHint:
      "Envoyez un Virement Autodeposit à efin@flovide.com. Mettez la référence dans le message pour que nous puissions apparier le dépôt.",
    flovideRequestTo: "Envoyer à",
    flovidePoweredBy: "Propulsé par eFinMoney · Flovide",
    flovideCopyHint: "Autodeposit activé — aucune question de sécurité. Mettez la référence dans le message.",
    flovideDetailsCopied: "Détails copiés — collez-les dans votre Virement Interac",
    fincraWaiting: "En attente de votre Virement Interac…",
    fincraPushHint:
      `Envoyez un Virement Autodeposit à ${FINCRA_CAD_INTERAC_ALIAS}. Collez le code de paiement dans le message pour que Fincra puisse apparier le dépôt.`,
    interacBankRef: "Numéro de référence Interac",
    interacBankRefHint: "Sur la confirmation de votre banque après l'envoi — par exemple CAh9ECkx.",
    interacBankRefPlaceholder: "CAh9ECkx",
    interacAmountTransferred: "Montant transféré",
    interacAmountTransferredHint: (amount: string) =>
      `Entrez le montant exact envoyé. Il doit correspondre à ${amount}, sinon Terminer sera refusé.`,
    interacAmountTransferredPlaceholder: "0,00",
    interacQty: "Qté",
    interacQtyHint: "Entrez 1 — cette commande est une seule ligne.",
    interacComplete: "Terminer",
  },
} as const;

export const CA_PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

/** Online banking entry points so CAD pay-in can open the sender's bank. */
export const BANK_ETRANSFER_LINKS: Array<{ name: string; url: string }> = [
  { name: "RBC Royal Bank", url: "https://www.rbcroyalbank.com/ways-to-bank/online-banking/index.html" },
  { name: "TD Canada Trust", url: "https://easyweb.td.com/waw/idp/login.htm" },
  { name: "Scotiabank", url: "https://www.scotiaonline.scotiabank.com/online/authentication/authentication.bns" },
  { name: "BMO Bank of Montreal", url: "https://www1.bmo.com/banking/digital/login" },
  { name: "CIBC", url: "https://www.cibc.com/en/personal-banking/ways-to-bank/online-banking.html" },
  { name: "National Bank of Canada", url: "https://www.nbc.ca" },
  { name: "Desjardins", url: "https://accweb.mouv.desjardins.com/identifiantunique/identification" },
  { name: "Tangerine", url: "https://www.tangerine.ca/app/#/login" },
  { name: "Simplii Financial", url: "https://online.simplii.com/ebm-resources/public/client/web/index.html" },
  { name: "EQ Bank", url: "https://secure.eqbank.ca/login" },
  { name: "HSBC Bank Canada", url: "https://www.hsbc.ca" },
  { name: "Laurentian Bank", url: "https://www.banquelaurentienne.ca" },
  { name: "Manulife Bank", url: "https://www.manulifebank.ca" },
  { name: "Canadian Western Bank", url: "https://www.cwbank.com" },
  { name: "ATB Financial", url: "https://www.atb.com/personal/good-to-go/" },
  { name: "VersaBank", url: "https://www.versabank.com" },
  { name: "Equitable Bank", url: "https://www.equitablebank.ca" },
  { name: "Home Trust", url: "https://www.hometrust.ca" },
  { name: "Peoples Trust", url: "https://www.peoplestrust.com" },
  { name: "Bridgewater Bank", url: "https://www.bridgewaterbank.ca" },
  { name: "Canadian Tire Bank", url: "https://www.ctfs.com" },
  { name: "PC Financial", url: "https://www.pcfinancial.ca" },
  { name: "Motusbank", url: "https://www.motusbank.ca" },
  { name: "Motive Financial", url: "https://www.motivefinancial.com" },
  { name: "Oaken Financial", url: "https://www.oaken.com" },
  { name: "Wealthsimple", url: "https://www.wealthsimple.com" },
  { name: "Neo Financial", url: "https://www.neofinancial.com" },
  { name: "KOHO", url: "https://www.koho.ca" },
  { name: "ICICI Bank Canada", url: "https://www.icicibank.ca" },
  { name: "First Nations Bank of Canada", url: "https://www.fnbc.ca" },
  { name: "Alterna Savings", url: "https://www.alterna.ca" },
  { name: "Meridian Credit Union", url: "https://www.meridiancu.ca" },
  { name: "DUCA Credit Union", url: "https://www.duca.com" },
  { name: "Libro Credit Union", url: "https://www.libro.ca" },
  { name: "FirstOntario Credit Union", url: "https://www.firstontario.com" },
  { name: "Your Neighbourhood Credit Union", url: "https://www.yncu.com" },
  { name: "Kawartha Credit Union", url: "https://www.kawarthacu.com" },
  { name: "Northern Credit Union", url: "https://www.northerncu.com" },
  { name: "Copperfin Credit Union", url: "https://www.copperfin.ca" },
  { name: "Kindred Credit Union", url: "https://www.kindredcu.com" },
  { name: "PenFinancial Credit Union", url: "https://www.penfinancial.com" },
  { name: "Tandia Financial Credit Union", url: "https://www.tandia.com" },
  { name: "Windsor Family Credit Union", url: "https://www.wfcu.ca" },
  { name: "Vancity", url: "https://www.vancity.com" },
  { name: "Coast Capital Savings", url: "https://www.coastcapitalsavings.com" },
  { name: "BlueShore Financial", url: "https://www.blueshorefinancial.com" },
  { name: "Prospera Credit Union", url: "https://www.prospera.ca" },
  { name: "Interior Savings", url: "https://www.interiorsavings.com" },
  { name: "First West Credit Union", url: "https://www.firstwestcu.ca" },
  { name: "Gulf and Fraser", url: "https://www.gulfandfraser.com" },
  { name: "Westminster Savings", url: "https://www.betterbanking.ca" },
  { name: "Khalsa Credit Union", url: "https://www.khalsacreditunion.ca" },
  { name: "Community Savings", url: "https://www.comsavings.com" },
  { name: "Servus Credit Union", url: "https://www.servus.ca" },
  { name: "Connect First Credit Union", url: "https://www.connectfirstcu.com" },
  { name: "Vision Credit Union", url: "https://www.visioncu.ca" },
  { name: "1st Choice Savings", url: "https://www.1stchoicesavings.ca" },
  { name: "Encompass Credit Union", url: "https://www.encompasscu.com" },
  { name: "Lakeland Credit Union", url: "https://www.lakelandcreditunion.com" },
  { name: "Bow Valley Credit Union", url: "https://www.bowvalleycu.com" },
  { name: "Assiniboine Credit Union", url: "https://www.acu.ca" },
  { name: "Cambrian Credit Union", url: "https://www.cambrian.mb.ca" },
  { name: "Access Credit Union", url: "https://www.accesscu.ca" },
  { name: "Steinbach Credit Union", url: "https://www.scu.mb.ca" },
  { name: "Sunrise Credit Union", url: "https://www.sunrisecu.mb.ca" },
  { name: "Achieva Financial", url: "https://www.achieva.mb.ca" },
  { name: "Outlook Financial", url: "https://www.outlookfinancial.com" },
  { name: "Hubert Financial", url: "https://www.hubert.com" },
  { name: "Conexus Credit Union", url: "https://www.conexus.ca" },
  { name: "Affinity Credit Union", url: "https://www.affinitycu.ca" },
  { name: "Innovation Credit Union", url: "https://www.innovationcu.ca" },
  { name: "Cornerstone Credit Union", url: "https://www.cornerstonecu.com" },
  { name: "Synergy Credit Union", url: "https://www.synergycu.ca" },
  { name: "TCU Financial Group", url: "https://www.tcufinancial.com" },
  { name: "UNI Financial Cooperation", url: "https://www.uni.coop" },
  { name: "East Coast Credit Union", url: "https://www.eastcoastcu.ca" },
  { name: "Credit Union Atlantic", url: "https://www.creditunionatlantic.ca" },
  { name: "Provincial Credit Union", url: "https://www.provincialcu.com" },
  { name: "Newfoundland and Labrador Credit Union", url: "https://www.nlcu.com" },
];

export function bankLink(bank?: string | null): string | null {
  const name = String(bank || "").trim().toLowerCase();
  if (!name) return null;
  const row = BANK_ETRANSFER_LINKS.find((b) => b.name.toLowerCase() === name)
    || BANK_ETRANSFER_LINKS.find((b) => b.name.toLowerCase().includes(name) || name.includes(b.name.toLowerCase()));
  return row?.url || null;
}

const PAYER_MEMORY_KEY = "efm-cad-payer";

export function readRememberedBank(): string {
  try {
    const raw = localStorage.getItem(PAYER_MEMORY_KEY);
    if (!raw) return "";
    const bank = String((JSON.parse(raw) as { bank?: string }).bank || "").trim();
    return bank;
  } catch {
    return "";
  }
}

export function rememberInteracBank(bank: string) {
  try {
    const raw = localStorage.getItem(PAYER_MEMORY_KEY);
    const prev = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    localStorage.setItem(PAYER_MEMORY_KEY, JSON.stringify({ ...prev, bank }));
  } catch {
    /* private mode */
  }
}
