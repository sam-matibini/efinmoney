/** Pure Fincra collection RFI answers for CAD Interac Autodeposit. */

export type FincraRfiContext = {
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  senderBank?: string;
  paymentCode?: string;
  interacReference?: string;
  amountCad?: number;
  purpose?: string;
  termsUrl?: string;
  privacyUrl?: string;
  merchantName?: string;
};

const DEFAULT_MERCHANT = "eFin Tax Advisors Ltd (trading as eFinMoney)";
const DEFAULT_TERMS = "https://www.efin.money/terms";
const DEFAULT_PRIVACY = "https://www.efin.money/privacy";

function senderLine(ctx: FincraRfiContext): string {
  const bits = [
    ctx.senderName,
    ctx.senderEmail,
    ctx.senderPhone,
    ctx.senderBank ? `bank: ${ctx.senderBank}` : "",
  ].filter(Boolean);
  return bits.length ? bits.join(", ") : "a registered eFinMoney customer";
}

function purposeLine(ctx: FincraRfiContext): string {
  const p = String(ctx.purpose || "topup").toLowerCase();
  if (p === "transfer") {
    return "to fund an eFinMoney remittance payout that this customer initiated to their named recipient";
  }
  if (p === "merchant_collection") {
    return "to pay an eFinMoney merchant collection on the customer’s account";
  }
  return "to credit the customer’s own eFinMoney CAD wallet (wallet top-up)";
}

function refsLine(ctx: FincraRfiContext): string {
  const bits: string[] = [];
  if (ctx.paymentCode) bits.push(`eFinMoney payment code ${ctx.paymentCode}`);
  if (ctx.interacReference) bits.push(`Interac bank reference ${ctx.interacReference}`);
  if (ctx.amountCad && Number.isFinite(ctx.amountCad)) {
    bits.push(`CAD ${Number(ctx.amountCad).toFixed(2)}`);
  }
  return bits.length ? bits.join("; ") : "this Autodeposit";
}

export function extractEfmPaymentCode(raw: unknown): string {
  const m = String(raw ?? "").toUpperCase().match(/EFM-[A-Z0-9-]+/);
  return m ? m[0] : "";
}

export function classifyFincraRfi(request: string):
  | "source"
  | "purpose"
  | "frequency"
  | "relationship"
  | "evidence"
  | "generic" {
  const q = request.toLowerCase();
  if (q.includes("evidence") || q.includes("contractual") || q.includes("document") || q.includes("agreement")) {
    return "evidence";
  }
  if (q.includes("relationship")) return "relationship";
  if (q.includes("frequency") || q.includes("one off") || q.includes("one-off") || q.includes("recurring")) {
    return "frequency";
  }
  if (q.includes("purpose")) return "purpose";
  if (q.includes("source")) return "source";
  return "generic";
}

export function draftFincraRfiAnswer(
  request: string,
  ctx: FincraRfiContext = {},
): { text: string; urls?: string[] } {
  const merchant = ctx.merchantName || DEFAULT_MERCHANT;
  const terms = ctx.termsUrl || DEFAULT_TERMS;
  const privacy = ctx.privacyUrl || DEFAULT_PRIVACY;
  const kind = classifyFincraRfi(request);
  const sender = senderLine(ctx);
  const refs = refsLine(ctx);

  if (kind === "source") {
    return {
      text:
        `Source of funds: the customer’s own Canadian bank account, sent as an Interac e-Transfer Autodeposit to ${merchant}, a FINTRAC-registered money services business. `
        + `Sender: ${sender}. ${refs}. These are the customer’s own funds, not a third-party cash deposit.`,
    };
  }
  if (kind === "purpose") {
    return {
      text:
        `Purpose of funds: ${purposeLine(ctx)}. ${refs}. `
        + `${merchant} receives CAD on the Fincra Interac Autodeposit alias and credits the customer’s eFinMoney ledger.`,
    };
  }
  if (kind === "frequency") {
    return {
      text:
        "One-off for this checkout. The customer may send further Interac Autodeposits when they top up or send again; each is a separate customer-initiated transfer, not a standing debit mandate or recurring pull.",
    };
  }
  if (kind === "relationship") {
    return {
      text:
        `The sender is a registered customer of ${merchant}. `
        + "We collect CAD on the customer’s behalf under our Terms of Service to credit their eFinMoney wallet. "
        + `Sender: ${sender}. ${refs}.`,
      urls: [terms],
    };
  }
  if (kind === "evidence") {
    return {
      text:
        `Evidence of relationship: the sender authenticated in the eFinMoney app, accepted our Terms of Service, and declared this Interac before sending (${refs}). `
        + `Contract: ${terms}. Privacy: ${privacy}.`,
      urls: [terms, privacy],
    };
  }
  return {
    text:
      `${merchant} CAD Interac Autodeposit for an eFinMoney customer. Sender: ${sender}. ${refs}. `
      + `Source: customer’s own Canadian bank account. Purpose: ${purposeLine(ctx)}. Frequency: one-off this checkout. `
      + `Relationship: MSB customer under ${terms}.`,
    urls: [terms],
  };
}
