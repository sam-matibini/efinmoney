/**
 * Loop Bank CAD collection (Interac Autodeposit + EFT deposit details).
 * Replaces Wise as the eFinMoney CAD receive rail.
 */

export type LoopCadEft = {
  bankNumber: string;
  transitNumber: string;
  accountNumber: string;
};

export type LoopCadConfig = {
  alias: string;
  eft: LoopCadEft;
  provider: "loop";
};

/** Defaults from ops — override with LOOP_CAD_* secrets. */
const DEFAULT_ALIAS = "etx@efin.money";
const DEFAULT_EFT: LoopCadEft = {
  bankNumber: "621",
  transitNumber: "20002",
  accountNumber: "500010169796",
};

export function getLoopCadConfig(): LoopCadConfig {
  const alias =
    Deno.env.get("LOOP_CAD_INTERAC_ALIAS")?.trim() ||
    Deno.env.get("WISE_CAD_INTERAC_ALIAS")?.trim() ||
    Deno.env.get("FINCRA_CAD_INTERAC_ALIAS")?.trim() ||
    DEFAULT_ALIAS;

  const eft: LoopCadEft = {
    bankNumber: Deno.env.get("LOOP_CAD_EFT_BANK")?.trim() || DEFAULT_EFT.bankNumber,
    transitNumber: Deno.env.get("LOOP_CAD_EFT_TRANSIT")?.trim() || DEFAULT_EFT.transitNumber,
    accountNumber: Deno.env.get("LOOP_CAD_EFT_ACCOUNT")?.trim() || DEFAULT_EFT.accountNumber,
  };

  return { alias, eft, provider: "loop" };
}

export function loopEftConfigured(eft: LoopCadEft): boolean {
  return Boolean(eft.bankNumber && eft.transitNumber && eft.accountNumber);
}

export function buildLoopInteracInstructions(
  amount: number,
  alias: string,
  reference: string,
  contact: string,
  purpose: string,
): string[] {
  return [
    `Open your Canadian banking app and start an Interac e-Transfer.`,
    `Send exactly CAD ${amount.toFixed(2)} to ${alias} (Loop Bank Autodeposit).`,
    `Put the reference ${reference} in the message field.`,
    `Send from ${contact} so we can match your deposit.`,
    `Autodeposit is enabled — no security question needed.`,
    purpose === "transfer"
      ? `Your transfer is released once we match the Loop deposit to this reference.`
      : purpose === "merchant_collection"
      ? `The payment is confirmed once we match the Loop deposit to this reference.`
      : `Your CAD wallet credits once we match the Loop deposit to this reference.`,
  ];
}

export function buildLoopEftInstructions(amount: number, eft: LoopCadEft, reference: string): string[] {
  return [
    `Send a CAD EFT / bill payment / bank transfer for exactly CAD ${amount.toFixed(2)}.`,
    `Institution (Bank #): ${eft.bankNumber}`,
    `Transit #: ${eft.transitNumber}`,
    `Account #: ${eft.accountNumber}`,
    `Include reference ${reference} in the memo / description when your bank allows it.`,
    `EFT usually arrives in 1–2 business days. Your wallet credits after we match the deposit.`,
  ];
}
