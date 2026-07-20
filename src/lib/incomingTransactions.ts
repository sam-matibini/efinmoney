export const INCOMING_REFERENCE_TYPES: string[] = [
  "transfer",
  "internal_transfer",
  "stellar_transfer",
  "stripe_topup",
  "flw_topup",
  "manual_topup",
  "wallet_topup",
  "nomba_pay_topup",
  "swychr_payin_topup",
  "paytota_pay_topup",
];

const INCOMING_LABELS: Record<string, string> = {
  transfer: "Incoming transfer",
  internal_transfer: "Received from eFinMoney user",
  stellar_transfer: "Incoming transfer (Stellar)",
  stripe_topup: "eFinMoney top-up",
  flw_topup: "eFinMoney top-up",
  manual_topup: "eFinMoney top-up",
  wallet_topup: "eFinMoney top-up",
  nomba_pay_topup: "eFinMoney top-up",
  swychr_payin_topup: "eFinMoney top-up",
  paytota_pay_topup: "eFinMoney top-up",
};

export const cleanIncomingTransactionLabel = (
  raw: string | null | undefined,
  refType: string | null | undefined,
) => {
  const fallback = INCOMING_LABELS[refType ?? ""] || "Incoming";

  if (!raw) return fallback;
  if (/stripe|pi_[A-Za-z0-9]+|wallet_topup|flw_|flutterwave|nomba|swychr|paytota/i.test(raw)) return fallback;

  return raw;
};

export const getIncomingTransactionMeta = (refType: string | null | undefined) => {
  switch (refType) {
    case "internal_transfer":
      return "eFinMoney transfer";
    case "stellar_transfer":
      return "Stellar transfer";
    case "stripe_topup":
    case "flw_topup":
    case "manual_topup":
    case "wallet_topup":
    case "nomba_pay_topup":
    case "swychr_payin_topup":
    case "paytota_pay_topup":
      return "Funds added to your wallet";
    case "transfer":
      return "Incoming transfer";
    default:
      return "Incoming funds";
  }
};