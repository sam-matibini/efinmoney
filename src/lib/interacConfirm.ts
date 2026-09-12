/** Confirmation controls for Interac e-Transfer complete. */

export const INTERAC_CONFIRM_QTY = 1;

/** Parse a CAD amount the payer typed (allows $ / CAD / commas). */
export function parseCadAmountInput(raw: string): number | null {
  let cleaned = raw
    .trim()
    .replace(/cad/gi, "")
    .replace(/\$/g, "")
    .replace(/\s/g, "");
  if (!cleaned) return null;
  if (cleaned.includes(",") && !cleaned.includes(".")) {
    cleaned = cleaned.replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function cadAmountsMatch(a: number, b: number): boolean {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

/** Quantity on the invoice line is always 1 — the payer must type that. */
export function isConfirmQtyOne(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const n = Number(trimmed);
  return Number.isFinite(n) && n === INTERAC_CONFIRM_QTY;
}

export type InteracConfirmInput = {
  interacReference: string;
  amountTransferredRaw: string;
  qtyRaw: string;
  checkoutAmount: number;
};

export type InteracConfirmResult =
  | { ok: true; interacReference: string; amountTransferred: number; qty: number }
  | { ok: false; error: string; code: "reference" | "amount" | "qty" };

const REF_RE = /^[A-Za-z0-9][A-Za-z0-9-]{3,31}$/;

export function validateInteracConfirm(
  input: InteracConfirmInput,
  lang: "en" | "fr" = "en",
): InteracConfirmResult {
  const fr = lang === "fr";
  const interacReference = input.interacReference.trim();
  if (!REF_RE.test(interacReference)) {
    return {
      ok: false,
      code: "reference",
      error: fr
        ? "Entrez le numéro de référence Interac (ex. CAh9ECkx)."
        : "Enter the Interac reference from your confirmation (for example CAh9ECkx).",
    };
  }

  const amountTransferred = parseCadAmountInput(input.amountTransferredRaw);
  if (amountTransferred == null || !cadAmountsMatch(amountTransferred, input.checkoutAmount)) {
    return {
      ok: false,
      code: "amount",
      error: fr
        ? `Le montant transféré doit correspondre au montant dû (CAD ${Number(input.checkoutAmount).toFixed(2)}).`
        : `Amount transferred must match the checkout amount (CAD ${Number(input.checkoutAmount).toFixed(2)}).`,
    };
  }

  if (!isConfirmQtyOne(input.qtyRaw)) {
    return {
      ok: false,
      code: "qty",
      error: fr
        ? "La quantité doit être 1 (une commande)."
        : "Quantity must be 1 (one order).",
    };
  }

  return {
    ok: true,
    interacReference,
    amountTransferred,
    qty: INTERAC_CONFIRM_QTY,
  };
}
